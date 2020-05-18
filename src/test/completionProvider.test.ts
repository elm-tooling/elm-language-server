import { CompletionProvider, CompletionResult } from "../providers";
import { CompletionParams } from "vscode-languageserver";
import { IElmWorkspace } from "../elmWorkspace";
import { SourceTreeParser } from "./utils/sourceTreeParser";
import { mockUri } from "./utils/mockElmWorkspace";

class MockCompletionProvider extends CompletionProvider {
  public handleCompletion(
    params: CompletionParams,
    elmWorkspace: IElmWorkspace,
  ): CompletionResult {
    return this.handleCompletionRequest(params, elmWorkspace);
  }
}

describe("CompletionProvider", () => {
  const completionProvider = new MockCompletionProvider();
  const treeParser = new SourceTreeParser();

  async function testCompletions(
    source: string[],
    line: number,
    character: number,
    expectedCompletions: string[],
    testDotCompletion?: boolean,
  ) {
    await treeParser.init();

    const sources = ["module Test exposing (..)", "", ...source];

    const completions = completionProvider.handleCompletion(
      {
        textDocument: { uri: mockUri },
        position: { line: line + 2, character },
        context: {
          triggerKind: 1,
        },
      },
      treeParser.getWorkspace(sources),
    );

    expect(completions?.length).toBe(expectedCompletions.length);
    completions?.forEach((completion, i) => {
      expect(completion.label).toBe(expectedCompletions[i]);
    });
  }

  it("Updating a record should have completions", async () => {
    const source = [
      `type alias Model = `,
      `  { prop1: String`,
      `  , prop2: Int`,
      `  }`,
      ``,
      `view : Model -> Model`,
      `view model =`,
      `  { model | p }`,
    ];

    await testCompletions(source, 7, 13, ["prop1", "prop2"]);
  });

  it("Updating a nested record should have completions", async () => {
    const source = [
      `type alias Model = `,
      `  { prop1: Data`,
      `  , prop2: Int`,
      `  }`,
      ``,
      `type alias Data = `,
      `  { item1: String`,
      `  , item2: Int`,
      `  }`,
      ``,
      `view : Model -> Model`,
      `view model =`,
      `  { model | prop1 = { i } }`,
    ];

    await testCompletions(source, 12, 23, ["item1", "item2"]);
  });

  it("Record access should have completions inside a let", async () => {
    const source = [
      `type alias Model = `,
      `  { prop1: String`,
      `  , prop2: Int`,
      `  }`,
      ``,
      `view : Model -> Model`,
      `view model =`,
      `  let`,
      `    var : String`,
      `    var = `,
      `      model.`,
      `        |> String.toFloat`,
      `        |> String.fromFloat`,
      ``,
      `  in`,
      `    model`,
    ];

    await testCompletions(source, 10, 12, ["prop1", "prop2"]);
  });
});
