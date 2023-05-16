import { container } from "tsyringe";
import { CodeAction } from "vscode-languageserver";
import { URI, Utils as UriUtils } from "vscode-uri";
import { IProgram } from "../../src/compiler/program";
import {
  CodeActionProvider,
  convertFromCompilerDiagnostic,
  convertToCompilerDiagnostic,
  DiagnosticsProvider,
} from "../../src/providers";
import { ElmLsDiagnostics } from "../../src/providers/diagnostics/elmLsDiagnostics";
import { ICodeActionParams } from "../../src/providers/paramsExtensions";
import { Utils } from "../../src/common/util/utils";
import {
  getTargetPositionFromSource,
  getSourceFiles,
} from "../utils/sourceParser";
import {
  SourceTreeParser,
  trimTrailingWhitespace,
  applyEditsToSource,
  stripCommentLines,
  srcUri,
} from "../utils/sourceTreeParser";
import { diff } from "jest-diff";
import { expect } from "@jest/globals";
import { createNodeFileSystemHost } from "../../src/node";

function codeActionEquals(a: CodeAction, b: CodeAction): boolean {
  return a.title === b.title;
}

const basicsSources = `
--@ Basics.elm
module Basics exposing ((+), (|>), (==), Int, Float, String, Maybe(..), Bool(..), Order(..))

infix left  0 (|>) = apR
infix non   4 (==) = eq
infix left  6 (+)  = add

type Int = Int

type Float = Float

type Bool = True | False

type String = String

type Maybe a
    = Just a
    | Nothing

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
  constructor() {
    super(createNodeFileSystemHost(container.resolve("Connection")));
  }

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

  const testUri = UriUtils.joinPath(srcUri, "Test.elm").toString();

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

  const codeActions =
    codeActionProvider.handleCodeAction({
      program,
      sourceFile,
      range: result.range,
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
          .filter((diag) => Utils.rangeOverlaps(diag.range, result.range))
          .map(convertFromCompilerDiagnostic),
      },
    }) ?? [];

  const codeActionsExist = expectedCodeActions.every((codeAction) =>
    codeActions.find((c) => codeActionEquals(codeAction, c)),
  );

  if (debug && !codeActionsExist) {
    console.log(diff(expectedCodeActions, codeActions));
  }

  expect(codeActionsExist).toBeTruthy();

  if (expectedResultAfterEdits) {
    const expectedSources = getSourceFiles(
      trimTrailingWhitespace(expectedResultAfterEdits),
    );

    const filteredCodeActions = codeActions.filter((codeAction) =>
      expectedCodeActions.find((c) => codeActionEquals(codeAction, c)),
    );

    if (filteredCodeActions.length === 0) {
      throw new Error("Couldn't find code action");
    }

    const changesToApply =
      filteredCodeActions[testFixAll ? filteredCodeActions.length - 1 : 0].edit!
        .changes!;

    Object.entries(expectedSources).forEach(([uri, source]) => {
      const edits = changesToApply[UriUtils.joinPath(srcUri, uri).toString()];
      if (edits) {
        expect(
          trimTrailingWhitespace(
            applyEditsToSource(stripCommentLines(result.sources[uri]), edits),
          ),
        ).toEqual(source);
      }
    });
  }
}
