import { container } from "tsyringe";
import { CodeAction } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IProgram } from "../../src/compiler/program";
import {
  CodeActionProvider,
  convertFromCompilerDiagnostic,
  convertToCompilerDiagnostic,
  DiagnosticsProvider,
} from "../../src/providers";
import { ElmLsDiagnostics } from "../../src/providers/diagnostics/elmLsDiagnostics";
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
  stripCommentLines,
} from "../utils/sourceTreeParser";
import diffDefault from "jest-diff";

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
}

export async function testCodeAction(
  source: string,
  expectedCodeActions: CodeAction[],
  expectedResultAfterEdits?: string,
  testFixAll = false,
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

  result.sources["Test.elm"] = stripCommentLines(result.sources["Test.elm"]);

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

  if (debug && !codeActionsExist) {
    console.log(diffDefault(expectedCodeActions, codeActions));
  }

  expect(codeActionsExist).toBeTruthy();

  if (expectedResultAfterEdits) {
    const expectedSources = getSourceFiles(
      trimTrailingWhitespace(expectedResultAfterEdits),
    );

    Object.entries(expectedSources).forEach(([uri, source]) => {
      expect(
        applyEditsToSource(
          stripCommentLines(result.sources[uri]),
          codeActions[testFixAll ? codeActions.length - 1 : 0].edit!.changes![
            URI.file(baseUri + uri).toString()
          ],
        ),
      ).toEqual(source);
    });
  }
}
