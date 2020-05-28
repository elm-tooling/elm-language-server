import { CompletionProvider, CompletionResult } from "../providers";
import {
  CompletionParams,
  CompletionContext,
  IConnection,
} from "vscode-languageserver";
import { IElmWorkspace } from "../elmWorkspace";
import { SourceTreeParser } from "./utils/sourceTreeParser";
import { mockUri } from "./utils/mockElmWorkspace";
import { mockDeep } from "jest-mock-extended";
import { getCaretPositionFromSource } from "./utils/sourceParser";

class MockCompletionProvider extends CompletionProvider {
  public handleCompletion(
    params: CompletionParams,
    elmWorkspace: IElmWorkspace,
  ): CompletionResult {
    return this.handleCompletionRequest(params, elmWorkspace);
  }
}

describe("CompletionProvider", () => {
  const connectionMock = mockDeep<IConnection>();

  const completionProvider = new MockCompletionProvider(connectionMock, []);
  const treeParser = new SourceTreeParser();

  /**
   * Run completion tests on a source
   *
   * @param source The source code in an array of lines
   * @param expectedCompletions The array of expected completions
   * @param testExactCompletions Test that the completion list ONLY includes the expected completions
   * @param testDotCompletion Test completions if a dot was the trigger character
   */
  async function testCompletions(
    source: string[],
    expectedCompletions: string[],
    testExactCompletions?: boolean,
    testDotCompletion?: boolean,
  ) {
    await treeParser.init();

    const { newSources, position } = getCaretPositionFromSource(source);

    function testCompletionsWithContext(context: CompletionContext) {
      const completions =
        completionProvider.handleCompletion(
          {
            textDocument: { uri: mockUri },
            position: position!,
            context,
          },
          treeParser.getWorkspace(newSources),
        ) ?? [];

      if (testExactCompletions) {
        expect(completions.length).toBe(expectedCompletions.length);
      } else {
        expect(completions.length).toBeGreaterThanOrEqual(
          expectedCompletions.length,
        );
      }

      expectedCompletions.forEach((completion) => {
        expect(completions.find((c) => c.label === completion)).toBeTruthy;
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

    await testCompletions(source, ["prop1", "prop2"], true);
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

    await testCompletions(source, ["item1", "item2"], true);
  });

  it("A record return type should have completions", async () => {
    const source = [
      `type alias Model = `,
      `  { prop1: String`,
      `  , prop2: Int`,
      `  }`,
      ``,
      `view : Model`,
      `view =`,
      `  { p{-caret-} }`,
    ];

    await testCompletions(source, ["prop1", "prop2"], true);

    const source2 = [
      `type alias Model = `,
      `  { prop1: String`,
      `  , prop2: Int`,
      `  }`,
      ``,
      `view : Model`,
      `view =`,
      `  let`,
      `    func : Model`,
      `    func = `,
      `      { p{-caret-} }`,
      ``,
      `  in`,
    ];

    await testCompletions(source2, ["prop1", "prop2"], true);
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

    await testCompletions(source, ["prop1", "prop2"], true, true);
  });

  it("Function parameter should have completions in a function", async () => {
    const source = [`test : Model -> String`, `test param =`, `  p{-caret-}`];

    await testCompletions(source, ["param"]);
  });

  it("Function parameter should have completions in a nested expression", async () => {
    const source = [
      `test : Model -> String`,
      `test param =`,
      `  let`,
      `    list = List.map (\_ -> p{-caret-})`,
    ];

    await testCompletions(source, ["param"]);
  });

  it("Let values should have completions", async () => {
    const source = [
      `test : Model -> String`,
      `test param =`,
      `  let`,
      `    val = "test"`,
      ``,
      `    another = v{-caret-}`,
    ];

    await testCompletions(source, ["val"]);

    const source2 = [
      `test : Model -> String`,
      `test param =`,
      `  let`,
      `    val = "test"`,
      ``,
      `  in`,
      `    "string" ++ v{-caret-}`,
    ];

    await testCompletions(source2, ["val"]);
  });

  it("Imported values should have completions", async () => {
    const source = [
      `import Html exposing (div)`,
      ``,
      `test : Model -> Html msg`,
      `test param =`,
      `  d{-caret-}`,
    ];

    await testCompletions(source, ["div"]);
  });
});
