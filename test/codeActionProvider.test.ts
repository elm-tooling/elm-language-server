import { container } from "tsyringe";
import { CodeAction } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IElmWorkspace } from "../src/elmWorkspace";
import { CodeActionProvider, ICodeActionParams } from "../src/providers";
import { Utils } from "../src/util/utils";
import { baseUri } from "./utils/mockElmWorkspace";
import { getTargetPositionFromSource } from "./utils/sourceParser";
import { SourceTreeParser } from "./utils/sourceTreeParser";

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

describe("test codeActionProvider", () => {
  const treeParser = new SourceTreeParser();
  let codeActionProvider: MockCodeActionsProvider;

  const debug = process.argv.find((arg) => arg === "--debug");

  async function testCodeAction(
    source: string,
    expectedCodeActions: CodeAction[],
  ) {
    await treeParser.init();

    if (!codeActionProvider) {
      codeActionProvider = new MockCodeActionsProvider();
    }

    const result = getTargetPositionFromSource(source);

    if (!result) {
      throw new Error("Getting sources failed");
    }

    const testUri = URI.file(baseUri + "Test.elm").toString();

    const program = treeParser.getWorkspace(result.sources);
    const sourceFile = program.getForest().getByUri(testUri);

    if (!sourceFile) throw new Error("Getting tree failed");

    const workspaces = container.resolve<IElmWorkspace[]>("ElmWorkspaces");
    workspaces.splice(0, workspaces.length);
    workspaces.push(program);

    const range = { start: result.position, end: result.position };
    const codeActions =
      codeActionProvider.handleCodeAction({
        program,
        sourceFile,
        range,
        textDocument: { uri: testUri },
        context: {
          diagnostics: program
            .getDiagnostics(sourceFile)
            .filter((diag) => Utils.rangeOverlaps(diag.range, range)),
        },
      }) ?? [];

    const codeActionsExist = expectedCodeActions.every((codeAction) =>
      codeActions.find((c) => codeActionEquals(codeAction, c)),
    );

    if (debug && !codeActionsExist) {
      console.log(
        `Expecting ${JSON.stringify(expectedCodeActions)}, got ${JSON.stringify(
          codeActions,
        )}`,
      );
    }

    expect(codeActionsExist).toBeTruthy();
  }

  test("add import of value", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = foo
      --^

--@ App.elm
module App exposing (foo)

foo = ""
`;
    await testCodeAction(basicsSources + source, [
      { title: `Import 'foo' from module "App"` },
    ]);
  });

  test("add import of qualified value", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = App.foo
          --^

--@ App.elm
module App exposing (foo)

foo = ""
`;
    await testCodeAction(basicsSources + source, [
      { title: `Import module "App"` },
    ]);

    const source2 = `
--@ Test.elm
module Test exposing (..)

func = App.foo
      --^

--@ App.elm
module App exposing (foo)

foo = ""
`;
    await testCodeAction(basicsSources + source2, [
      { title: `Import module "App"` },
    ]);
  });

  test("add all missing imports", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = foo + bar
      --^

--@ App.elm
module App exposing (foo, bar)

foo = ""

bar = ""
`;
    await testCodeAction(basicsSources + source, [
      { title: `Add all missing imports` },
    ]);
  });
});
