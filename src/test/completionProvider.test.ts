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
    dontAddModuleDeclaration?: boolean,
  ) {
    await treeParser.init();

    const { newSources, position } = getCaretPositionFromSource(source);

    if (!position) {
      fail();
    }

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
        expect(completions.find((c) => c.label === completion)).toBeTruthy();
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
      `  in`,
      `    ""`,
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
      ``,
      `  in`,
      `    ""`,
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
      `import Test2 exposing (testFunction)`,
      ``,
      `test : Int -> String`,
      `test param =`,
      `  {-caret-}`,
    ];

    await testCompletions(source, ["testFunction", "Test2.testFunction"]);

    const source2 = [
      `import Test2 exposing (..)`,
      ``,
      `test : T{-caret-} -> String`,
      `test param =`,
      `  ""`,
    ];

    await testCompletions(source2, ["TestType"]);
  });

  it("Importing modules should have completions", async () => {
    const source = [`import {-caret-}`];

    await testCompletions(source, ["Test", "Test2"], true);

    const source2 = [`import T{-caret-}`];

    await testCompletions(source2, ["Test", "Test2"], true);
  });

  it("Exposing a value should have completions", async () => {
    const source = [`import Test2 exposing ({-caret-})`];

    await testCompletions(source, ["testFunction", "Msg", "TestType"], true);

    const source2 = [`import Test2 exposing (testFunction, {-caret-})`];

    await testCompletions(source2, ["testFunction", "Msg", "TestType"], true);

    const source3 = [`import Test2 exposing (testFunction, T{-caret-})`];

    await testCompletions(source3, ["testFunction", "Msg", "TestType"], true);
  });

  it("Exposing list should have completions", async () => {
    const source = [
      `module Test exposing ({-caret-})`,
      ``,
      `testFunc : String`,
      `testFunc = `,
      `  ""`,
      ``,
      ``,
      `type Msg = Msg1 | Msg2`,
      ``,
      `type alias TestType = `,
      `  { prop : String }`,
    ];

    await testCompletions(
      source,
      ["testFunc", "Msg", "Msg(..)", "Msg1", "Msg2", "TestType"],
      true,
      false,
      true,
    );

    const source2 = [
      `module Test exposing ({-caret-}`,
      ``,
      `import Test2 exposing (..)`,
      ``,
      `testFunc : String`,
      `testFunc = `,
      `  ""`,
      ``,
      ``,
      `type Msg = Msg1 | Msg2`,
    ];

    await testCompletions(
      source2,
      ["testFunc", "Msg", "Msg(..)", "Msg1", "Msg2"],
      true,
      false,
      true,
    );

    const source3 = [
      `module Test exposing (testFunc, {-caret-}`,
      ``,
      `import Test2 exposing (..)`,
      ``,
      `testFunc : String`,
      `testFunc = `,
      `  ""`,
      ``,
      ``,
      `type Msg = Msg1 | Msg2`,
    ];

    await testCompletions(
      source3,
      ["testFunc", "Msg", "Msg(..)", "Msg1", "Msg2"],
      true,
      false,
      true,
    );
  });

  it("Function name should have completions in annotation and declaration", async () => {
    const source = [`{-caret-}`, `func = `, `  ""`];

    await testCompletions(source, ["func"], true);

    const source2 = [`func : String`, `f{-caret-} = `, `  ""`];

    await testCompletions(source2, ["func"], true);
  });

  it("Case branch variables should have completions", async () => {
    const source = [
      `type Msg = Msg1 String`,
      ``,
      `func : Msg -> String`,
      `func msg = `,
      `  case msg of`,
      `    Msg1 str ->`,
      `      s{-caret-}`,
    ];

    await testCompletions(source, ["str"]);
  });
});
