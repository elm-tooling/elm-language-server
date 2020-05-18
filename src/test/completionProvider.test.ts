import { CompletionProvider, CompletionResult } from "../providers";
import { CompletionParams } from "vscode-languageserver";
import { IElmWorkspace } from "../elmWorkspace";
import { SourceTreeParser, mockUri } from "./testUtils";

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

  it("Record completions should work", async () => {
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
});
