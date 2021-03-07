import { container } from "tsyringe";
import { CodeAction } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { ISourceFile } from "../../src/compiler/forest";
import { IProgram } from "../../src/compiler/program";
import {
  CodeActionProvider,
  IRefactorCodeAction,
  convertFromCompilerDiagnostic,
  convertToCompilerDiagnostic,
  DiagnosticsProvider,
} from "../../src/providers";
import { ElmLsDiagnostics } from "../../src/providers/diagnostics/elmLsDiagnostics";
import { DiagnosticKind } from "../../src/providers/diagnostics/fileDiagnostics";
import { ICodeActionParams } from "../../src/providers/paramsExtensions";
import { Utils } from "../../src/util/utils";
import {
  getTargetPositionFromSource,
  getSourceFiles,
} from "../utils/sourceParser";
import {
  SourceTreeParser,
  trimTrailingWhitespace,
  baseUri,
  applyEditsToSource,
  stripCursorCommentLines,
} from "../utils/sourceTreeParser";

function codeActionEquals(a: CodeAction, b: CodeAction): boolean {
  return a.title === b.title;
}

const basicsSources = `
--@ Basics.elm
module Basics exposing ((+), (|>), (==), Int, Float, Bool(..), Order(..))

infix left  0 (|>) = apR
infix non   4 (==) = eq
infix left  6 (+)  = add

type Int = Int

type Float = Float

type Bool = True | False

add : number -> number -> number
add =
  Elm.Kernel.Basics.add

apR : a -> (a -> b) -> b
apR x f =
  f x

eq : a -> a -> Bool
eq =
  Elm.Kernel.Utils.equal

type Order = LT | EQ | GT
`;

class MockCodeActionsProvider extends CodeActionProvider {
  public handleCodeAction(params: ICodeActionParams): CodeAction[] | undefined {
    return this.onCodeAction(params);
  }

  public resolveCodeAction(
    codeAction: IRefactorCodeAction,
    program: IProgram,
    sourceFile: ISourceFile,
  ): IRefactorCodeAction | undefined {
    return this.onCodeActionResolve(codeAction, program, sourceFile);
  }
}

export async function testCodeAction(
  source: string,
  expectedCodeActions: CodeAction[],
  expectedResultAfterEdits?: string,
  testFixAll = false,
  unexpectedCodeActions?: CodeAction[],
): Promise<void> {
  const treeParser = new SourceTreeParser();
  await treeParser.init();
  const codeActionProvider = new MockCodeActionsProvider();

  const debug = process.argv.find((arg) => arg === "--debug");

  const result = getTargetPositionFromSource(
    basicsSources + trimTrailingWhitespace(source),
  );

  if (!result) {
    throw new Error("Getting sources failed");
  }

  const testUri = URI.file(baseUri + "Test.elm").toString();

  result.sources["Test.elm"] = stripCursorCommentLines(
    result.sources["Test.elm"],
  );

  const program = await treeParser.getProgram(result.sources);
  const sourceFile = program.getForest().getByUri(testUri);

  if (!sourceFile) throw new Error("Getting tree failed");

  const workspaces = container.resolve<IProgram[]>("ElmWorkspaces");
  workspaces.splice(0, workspaces.length);
  workspaces.push(program);

  container.register(DiagnosticsProvider, {
    useValue: new DiagnosticsProvider(),
  });

  // Needed by codeActionProvider which uses these diagnostics
  container
    .resolve(DiagnosticsProvider)
    .forceElmLsDiagnosticsUpdate(sourceFile, program);

  const range = { start: result.position, end: result.position };
  const codeActions =
    codeActionProvider.handleCodeAction({
      program,
      sourceFile,
      range,
      textDocument: { uri: testUri },
      context: {
        diagnostics: [
          ...program.getSyntacticDiagnostics(sourceFile),
          ...program.getSemanticDiagnostics(sourceFile),
          ...program.getSuggestionDiagnostics(sourceFile),
          ...new ElmLsDiagnostics()
            .createDiagnostics(sourceFile, program)
            .map(convertToCompilerDiagnostic),
        ]
          .filter((diag) => Utils.rangeOverlaps(diag.range, range))
          .map(convertFromCompilerDiagnostic),
      },
    }) ?? [];

  const codeActionsExist = expectedCodeActions.every((codeAction) =>
    codeActions.find((c) => codeActionEquals(codeAction, c)),
  );

  const codeActionsExistWhichShouldNotExist = unexpectedCodeActions?.every(
    (codeAction) => codeActions.find((c) => codeActionEquals(codeAction, c)),
  );

  if (debug && !codeActionsExist) {
    console.log(
      `Expecting ${JSON.stringify(expectedCodeActions)}, got ${JSON.stringify(
        codeActions,
      )}`,
    );
  }

  expect(codeActionsExist).toBeTruthy();

  if (debug && codeActionsExistWhichShouldNotExist) {
    console.log(
      `Expecting none of ${JSON.stringify(
        unexpectedCodeActions,
      )}, got ${JSON.stringify(codeActionsExistWhichShouldNotExist)}`,
    );
  }

  expect(codeActionsExistWhichShouldNotExist).toBeFalsy();

  if (expectedResultAfterEdits) {
    const expectedSources = getSourceFiles(
      trimTrailingWhitespace(expectedResultAfterEdits),
    );

    Object.entries(expectedSources).forEach(([uri, source]) => {
      if (codeActions[0].edit === undefined) {
        codeActionProvider.onCodeActionResolve(
          codeActions[0] as IRefactorCodeAction,
          program,
          sourceFile,
        );
      }
      expect(
        applyEditsToSource(
          stripCursorCommentLines(result.sources[uri]),
          codeActions[testFixAll ? codeActions.length - 1 : 0].edit!.changes![
            URI.file(baseUri + uri).toString()
          ],
        ),
      ).toEqual(source);
    });
  }
}
