import { CompletionProvider, CompletionResult } from "../providers";
import {
  CompletionParams,
  CompletionContext,
  IConnection,
} from "vscode-languageserver";
import { IElmWorkspace } from "../elmWorkspace";
import { SourceTreeParser } from "./utils/sourceTreeParser";
import { baseUri } from "./utils/mockElmWorkspace";
import { mockDeep } from "jest-mock-extended";
import { getCaretPositionFromSource } from "./utils/sourceParser";
import { URI } from "vscode-uri";

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
    source: string,
    expectedCompletions: string[],
    testExactCompletions?: boolean,
    testDotCompletion?: boolean,
  ) {
    await treeParser.init();

    const { newSources, position, fileWithCaret } = getCaretPositionFromSource(
      source,
    );

    if (!position) {
      fail();
    }

    function testCompletionsWithContext(context: CompletionContext) {
      const completions =
        completionProvider.handleCompletion(
          {
            textDocument: { uri: URI.file(baseUri + fileWithCaret).toString() },
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
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: String
  , prop2: Int
  }

view : Model -> Model
view model =
  { model | p{-caret-} }
`;

    await testCompletions(source, ["prop1", "prop2"], true);
  });

  it("Updating a nested record should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: Data
  , prop2: Int
  }

type alias Data = 
  { item1: String
  , item2: Int
  }

view : Model -> Model
view model =
  { model | prop1 = { i{-caret-} } }
`;

    await testCompletions(source, ["item1", "item2"], true);
  });

  it("A record return type should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: String
  , prop2: Int
  }

view : Model
view =
  { p{-caret-} }
`;

    await testCompletions(source, ["prop1", "prop2"], true);

    const source2 = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: String
  , prop2: Int
  }

view : Model
view =
  let
    func : Model
    func = 
      { p{-caret-} }

  in
`;

    await testCompletions(source2, ["prop1", "prop2"], true);
  });

  it("Record access should have completions inside a let", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: String
  , prop2: Int
  }

view : Model -> Model
view model =
  let
    var : String
    var = 
      model.{-caret-}
        |> String.toFloat
        |> String.fromFloat

  in
    model
`;

    await testCompletions(source, ["prop1", "prop2"], true, true);
  });

  it("Function parameter should have completions in a function", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

test : Model -> String
test param =
  p{-caret-}
`;

    await testCompletions(source, ["param"]);
  });

  it("Function parameter should have completions in a nested expression", async () => {
    const source = `
--@ Test.elm    
module Test exposing (..)

test : Model -> String
test param =
  let
    list = List.map (\_ -> p{-caret-})
  in
    ""
`;

    await testCompletions(source, ["param"]);
  });

  it("Let values should have completions", async () => {
    const source = `
--@ Test.elm    
module Test exposing (..)

test : Model -> String
test param =
  let
    val = "test"

    another = v{-caret-}

  in
    ""
`;

    await testCompletions(source, ["val"]);

    const source2 = `
--@ Test.elm    
module Test exposing (..)

test : Model -> String
test param =
  let
    val = "test"

  in
    "string" ++ v{-caret-}
`;

    await testCompletions(source2, ["val"]);
  });

  it("Imported values should have completions", async () => {
    const otherSource = `
--@ OtherModule.elm
module OtherModule exposing (Msg, TestType, testFunction)

type alias TestType =
    { prop1 : String
    , prop2 : Int
    }

type Msg
    = Msg1
    | Msg2

testFunction : String
testFunction =
    "Test"

localFunction : String
localFunction =
    ""

`;

    const source = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (testFunction)

test : Int -> String
test param =
  {-caret-}
`;

    await testCompletions(otherSource + source, [
      "testFunction",
      "OtherModule.testFunction",
    ]);

    const source2 = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (..)

test : T{-caret-} -> String
test param =
  ""
`;

    await testCompletions(otherSource + source2, ["TestType"]);
  });

  it("Importing modules should have completions", async () => {
    const otherSource = `
--@ OtherModule.elm
module OtherModule exposing (..)

main = 
  ""
`;
    const source = `
--@ Test.elm
module Test exposing (..)

import {-caret-}
`;

    await testCompletions(otherSource + source, ["Test", "OtherModule"], true);

    const source2 = `
--@ Test.elm
module Test exposing (..)

import T{-caret-}
`;

    await testCompletions(otherSource + source2, ["Test", "OtherModule"], true);
  });

  it("Exposing a value from another module should have completions", async () => {
    const otherSource = `
--@ OtherModule.elm
module OtherModule exposing (Msg, TestType, testFunction)

type alias TestType =
    { prop1 : String
    , prop2 : Int
    }

type Msg
    = Msg1
    | Msg2

testFunction : String
testFunction =
    "Test"

localFunction : String
localFunction =
    ""
`;

    const source = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing ({-caret-})
`;

    await testCompletions(
      otherSource + source,
      ["testFunction", "Msg", "TestType"],
      true,
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (testFunction, {-caret-})
`;

    await testCompletions(
      otherSource + source2,
      ["testFunction", "Msg", "TestType"],
      true,
    );

    const source3 = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (testFunction, T{-caret-})
`;

    await testCompletions(
      otherSource + source3,
      ["testFunction", "Msg", "TestType"],
      true,
    );
  });

  it("Module exposing list should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing ({-caret-})

testFunc : String
testFunc = 
  ""

type Msg = Msg1 | Msg2

type alias TestType = 
  { prop : String }
`;

    await testCompletions(
      source,
      ["testFunc", "Msg", "Msg(..)", "Msg1", "Msg2", "TestType"],
      true,
    );
  });

  it("Function name should have completions in annotation and declaration", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

{-caret-} 
func =
  ""
    `;

    await testCompletions(source, ["func"], true);

    const source2 = `
--@ Test.elm
module Test exposing (..)

func : String
f{-caret-} =  
  ""
`;

    await testCompletions(source2, ["func"], true);
  });

  it("Case branch variables should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type Msg = Msg1 String

func : Msg -> String
func msg = 
  case msg of
    Msg1 str ->
      s{-caret-}
`;

    await testCompletions(source, ["str"]);
  });
});
