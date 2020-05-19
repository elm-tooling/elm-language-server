import { CompletionProvider, CompletionResult } from "../providers";
import {
  CompletionParams,
  CompletionContext,
  IConnection,
} from "vscode-languageserver";
import { IElmWorkspace } from "../elmWorkspace";
import { SourceTreeParser } from "./utils/sourceTreeParser";
import { mockUri } from "./utils/mockElmWorkspace";
import { Position } from "vscode-languageserver-textdocument";
import { mockDeep } from "jest-mock-extended";

class MockCompletionProvider extends CompletionProvider {
  public handleCompletion(
    params: CompletionParams,
    elmWorkspace: IElmWorkspace,
  ): CompletionResult {
    return this.handleCompletionRequest(params, elmWorkspace);
  }
}

function getCaretPositionFromSource(
  source: string[],
): { position?: Position; newSource: string[] } {
  const result: {
    newSource: string[];
    position?: Position;
  } = { newSource: source };

  source.forEach((s, line) => {
    const character = s.search("{-caret-}");
    result.newSource[line] = s.replace("{-caret-}", "");

    if (character >= 0) {
      result.position = { line, character };
    }
  });

  return result;
}

describe("CompletionProvider", () => {
  const connectionMock = mockDeep<IConnection>();

  const completionProvider = new MockCompletionProvider(connectionMock, []);
  const treeParser = new SourceTreeParser();

  async function testCompletions(
    source: string[],
    expectedCompletions: string[],
    testDotCompletion?: boolean,
  ) {
    await treeParser.init();

    const { newSource, position } = getCaretPositionFromSource(source);

    if (!position) {
      fail();
    }

    // Add the module header and account for it in the cursor position
    const sources = ["module Test exposing (..)", "", ...newSource];
    position.line += 2;

    function testCompletionsWithContext(context: CompletionContext) {
      const completions = completionProvider.handleCompletion(
        {
          textDocument: { uri: mockUri },
          position: position!,
          context,
        },
        treeParser.getWorkspace(sources),
      );

      expect(completions?.length).toBe(expectedCompletions.length);
      completions?.forEach((completion, i) => {
        expect(completion.label).toBe(expectedCompletions[i]);
      });
    }

    testCompletionsWithContext({ triggerKind: 1 });

    if (testDotCompletion) {
      testCompletionsWithContext({ triggerKind: 2, triggerCharacter: "." });
    }
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
      `  { model | p{-caret-} }`,
    ];

    await testCompletions(source, ["prop1", "prop2"]);
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
      `  { model | prop1 = { i{-caret-} } }`,
    ];

    await testCompletions(source, ["item1", "item2"]);
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
      `      model.{-caret-}`,
      `        |> String.toFloat`,
      `        |> String.fromFloat`,
      ``,
      `  in`,
      `    model`,
    ];

    await testCompletions(source, ["prop1", "prop2"], true);
  });
});
