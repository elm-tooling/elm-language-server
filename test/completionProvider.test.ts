import { isDeepStrictEqual } from "util";
import {
  CompletionContext,
  CompletionItem,
  Position,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { CompletionProvider, CompletionResult } from "../src/providers";
import { ICompletionParams } from "../src/providers/paramsExtensions";
import { getCaretPositionFromSource } from "./utils/sourceParser";
import { baseUri, SourceTreeParser } from "./utils/sourceTreeParser";

class MockCompletionProvider extends CompletionProvider {
  public handleCompletion(params: ICompletionParams): CompletionResult {
    return this.handleCompletionRequest(params);
  }
}

type exactCompletions = "exactMatch" | "partialMatch";
type dotCompletions = "triggeredByDot" | "normal";

describe("CompletionProvider", () => {
  const treeParser = new SourceTreeParser();

  const debug = process.argv.find((arg) => arg === "--debug");

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
    expectedCompletions: (
      | string
      | CompletionItem
      | { name: string; shouldNotExist: boolean }
    )[],
    testExactCompletions: exactCompletions = "partialMatch",
    testDotCompletion: dotCompletions = "normal",
  ) {
    await treeParser.init();
    const completionProvider = new MockCompletionProvider();

    const { newSources, position, fileWithCaret } = getCaretPositionFromSource(
      source,
    );

    if (!position) {
      throw new Error("Getting position failed");
    }

    const testUri = URI.file(baseUri + fileWithCaret).toString();
    const program = await treeParser.getProgram(newSources);
    const sourceFile = program.getSourceFile(testUri);

    function testCompletionsWithContext(context: CompletionContext): void {
      if (!sourceFile) throw new Error("Getting source file failed");

      const completions =
        completionProvider.handleCompletion({
          textDocument: { uri: testUri },
          position: position!,
          context,
          program,
          sourceFile,
        }) ?? [];

      const completionsList = Array.isArray(completions)
        ? completions
        : completions.items;

      if (debug && completionsList.length === 0) {
        console.log(
          `No completions found with context ${JSON.stringify(
            context,
          )}, expected completions: ${JSON.stringify(expectedCompletions)}`,
        );
      } else if (
        debug &&
        testExactCompletions === "exactMatch" &&
        completionsList.length !== expectedCompletions.length
      ) {
        console.log(
          `Wrong completions: ${JSON.stringify(
            completionsList.map((c) => c.label),
          )}, expected: ${JSON.stringify(expectedCompletions)}`,
        );
      }

      if (testExactCompletions === "exactMatch") {
        expect(completionsList.length).toBe(expectedCompletions.length);
      } else {
        expect(completionsList.length).toBeGreaterThanOrEqual(
          expectedCompletions.length,
        );
      }

      expectedCompletions.forEach((completion) => {
        let result = !!completionsList.find((c) => {
          if (typeof completion === "string") {
            return c.label === completion;
          } else if ("shouldNotExist" in completion) {
            return c.label === completion.name;
          } else {
            // Compare label, detail, and text edit text
            return (
              c.label === completion.label &&
              c.detail === completion.detail &&
              c.additionalTextEdits &&
              completion.additionalTextEdits &&
              isDeepStrictEqual(
                c.additionalTextEdits[0],
                completion.additionalTextEdits[0],
              )
            );
          }
        });

        // Flip result if it should not exist
        if (
          typeof completion === "object" &&
          "shouldNotExist" in completion &&
          completion.shouldNotExist
        ) {
          result = !result;
        }

        if (!result && debug) {
          console.log(
            `Could not find ${completion} in ${JSON.stringify(
              completionsList,
            )}`,
          );
        }

        expect(result).toBe(true);
      });
    }

    testCompletionsWithContext({ triggerKind: 1 });

    if (testDotCompletion === "triggeredByDot") {
      testCompletionsWithContext({ triggerKind: 2, triggerCharacter: "." });
    }
  }

  it("Should complete module keyword", async () => {
    const sourceModule = `
--@ Test.elm
{-caret-} 
  ""
    `;
    await testCompletions(sourceModule, ["module"], "partialMatch");

    const sourceModule2 = `
--@ Test.elm
m{-caret-}

  `;
    await testCompletions(sourceModule2, ["module"], "partialMatch");
  });

  it("Should complete import keyword", async () => {
    const sourceImport = `
--@ Test.elm
module Test exposing (..)

{-caret-}
    
    `;
    await testCompletions(sourceImport, ["import"], "partialMatch");

    const sourceImport2 = `
--@ Test.elm
module Test exposing (..)

i{-caret-}
  ""
`;
    await testCompletions(sourceImport2, ["import"], "partialMatch");
  });

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

    await testCompletions(source, ["prop1", "prop2"], "exactMatch");
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

    await testCompletions(source, ["item1", "item2"], "exactMatch");
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

    await testCompletions(source, ["prop1", "prop2"], "exactMatch");

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
    testFunc : Model
    testFunc = 
      { p{-caret-} }

  in
`;

    await testCompletions(source2, ["prop1", "prop2"], "exactMatch");
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

    await testCompletions(
      source,
      ["prop1", "prop2"],
      "exactMatch",
      "triggeredByDot",
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: String
  , prop2: Int
  }

view : Model -> Model
view model =
  let
    var = 
      model.p{-caret-}

  in
    model
`;

    await testCompletions(
      source2,
      ["prop1", "prop2"],
      "exactMatch",
      "triggeredByDot",
    );
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

    await testCompletions(otherSource + source, ["OtherModule"], "exactMatch");

    const source2 = `
--@ Test.elm
module Test exposing (..)

import T{-caret-}
`;

    await testCompletions(otherSource + source2, ["OtherModule"], "exactMatch");
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
      "exactMatch",
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (testFunction, {-caret-})
`;

    await testCompletions(
      otherSource + source2,
      ["testFunction", "Msg", "TestType"],
      "exactMatch",
    );

    const source3 = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (testFunction, T{-caret-})
`;

    await testCompletions(
      otherSource + source3,
      ["testFunction", "Msg", "TestType"],
      "exactMatch",
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
      "exactMatch",
    );
  });

  it("Function name should have completions in annotation and declaration", async () => {
    const sourceAnnotation = `
--@ Test.elm
module Test exposing (..)

{-caret-} 
testFunc =
  ""
    `;
    await testCompletions(sourceAnnotation, ["testFunc : "], "exactMatch");

    const sourceAnnotation2 = `
--@ Test.elm
module Test exposing (..)

c{-caret-}
count =
  15
  `;
    await testCompletions(sourceAnnotation2, ["count : "], "exactMatch");

    const sourceFunc = `
--@ Test.elm
module Test exposing (..)

count : Int
{-caret-}
    
    `;
    await testCompletions(sourceFunc, ["count"], "exactMatch");

    const sourceFunc1 = `
--@ Test.elm
module Test exposing (..)

testFunc : String
t{-caret-} =  
  ""
`;
    await testCompletions(sourceFunc1, ["testFunc"], "exactMatch");
  });

  it("Case branch variables should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type Msg = Msg1 String

testFunc : Msg -> String
testFunc msg = 
  case msg of
    Msg1 str ->
      s{-caret-}
`;

    await testCompletions(source, ["str"]);
  });

  it("There should be auto import completions from other modules", async () => {
    const source = `
--@ OtherModule.elm
module OtherModule exposing (testFunction, TestType)

testFunction : String
testFunction =
  ""

type alias TestType = {prop : String}

--@ Test.elm
module Test exposing (..)

testFunc : String
testFunc = 
  {-caret-}
`;

    await testCompletions(source, [
      {
        label: "testFunction",
        detail: "Auto import from module 'OtherModule'",
        additionalTextEdits: [
          TextEdit.insert(
            Position.create(1, 0),
            "import OtherModule exposing (testFunction)\n",
          ),
        ],
      },
      {
        label: "TestType",
        detail: "Auto import from module 'OtherModule'",
        additionalTextEdits: [
          TextEdit.insert(
            Position.create(1, 0),
            "import OtherModule exposing (TestType)\n",
          ),
        ],
      },
    ]);

    const source2 = `
--@ OtherModule.elm
module OtherModule exposing (Msg(..))

type Msg = Msg1 | Msg2

--@ Test.elm
module Test exposing (..)

testFunc : String
testFunc = 
  {-caret-}
`;

    await testCompletions(source2, [
      {
        label: "Msg",
        detail: "Auto import from module 'OtherModule'",
        additionalTextEdits: [
          TextEdit.insert(
            Position.create(1, 0),
            "import OtherModule exposing (Msg)\n",
          ),
        ],
      },
      {
        label: "Msg1",
        detail: "Auto import from module 'OtherModule'",
        additionalTextEdits: [
          TextEdit.insert(
            Position.create(1, 0),
            "import OtherModule exposing (Msg(..))\n",
          ),
        ],
      },
      {
        label: "Msg2",
        detail: "Auto import from module 'OtherModule'",
        additionalTextEdits: [
          TextEdit.insert(
            Position.create(1, 0),
            "import OtherModule exposing (Msg(..))\n",
          ),
        ],
      },
    ]);
  });

  it("Imported modules should have fully qualified completions", async () => {
    const source = `
--@ Data/User.elm
module Data.User exposing (..)

func : String
func = 
  ""
  
--@ Test.elm
module Test exposing (..)

import Data.User

test = 
  {-caret-}
`;

    await testCompletions(
      source,
      ["Data.User.func"],
      "partialMatch",
      "triggeredByDot",
    );

    const source2 = `
--@ Data/User.elm
module Data.User exposing (..)

func : String
func = 
  ""

type alias TestType = { prop : String }
  
--@ Test.elm
module Test exposing (..)

import Data.User

test = 
  Da{-caret-}
`;

    await testCompletions(
      source2,
      ["Data.User.func", "Data.User.TestType"],
      "partialMatch",
      "triggeredByDot",
    );
  });

  it("Qualified union constructor completion in expr should have completions", async () => {
    const source = `
--@ Page.elm
module Page exposing (..)

type Page = Home | Away

--@ Test.elm
module Test exposing (..)

import Page

defaultPage = 
  Page.{-caret-}

func = ""
`;

    await testCompletions(
      source,
      ["Home", "Away"],
      "partialMatch",
      "triggeredByDot",
    );

    const source2 = `
--@ Page.elm
module Page exposing (..)

type Page = Home | Away

--@ Test.elm
module Test exposing (..)

import Page

defaultPage = 
  Page.{-caret-}
    `;

    await testCompletions(
      source2,
      ["Home", "Away"],
      "partialMatch",
      "triggeredByDot",
    );
  });

  xit("Chained record access should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Foo = { name : { first : String } }

f : Foo -> String
f foo =
    foo.name.{-caret-}
`;

    await testCompletions(source, ["first"], "exactMatch", "triggeredByDot");
  });

  it("Union constructor completions from pattern destructuring", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type MyState = State Int

f (S{-caret-} n) = n
`;

    await testCompletions(source, ["State"]);
  });

  it("Union type completions in a type annotation", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type Page = Home

defaultPage : P{-caret-}
`;

    await testCompletions(source, ["Page"]);
  });

  it("Type alias completions in a type annotation", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias User = { name : String, age : Int }

viewUser : U{-caret-}
`;

    await testCompletions(source, ["User"]);
  });

  it("Possible submodule completions", async () => {
    const source = `
--@ Module/Submodule.elm
module Module.Submodule exposing (..)

func = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

func = ""

--@ Test.elm
module Test exposing (..)

test : Module.{-caret-}
`;

    await testCompletions(
      source,
      ["Submodule", "Submodule.AnotherSubmodule"],
      "exactMatch",
      "triggeredByDot",
    );

    const source2 = `
--@ Module/Submodule.elm
module Module.Submodule exposing (..)

func = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

func = ""

--@ Test.elm
module Test exposing (..)

test = Module.Submodule.{-caret-}
    `;

    await testCompletions(
      source2,
      ["AnotherSubmodule", "func"],
      "exactMatch",
      "triggeredByDot",
    );

    const source3 = `
--@ Module/Submodule.elm
module Module.Submodule exposing (..)

func = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

func = ""

--@ Test.elm
module Test exposing (..)

test = Module.sub{-caret-}
    `;

    await testCompletions(
      source3,
      ["Submodule", "Submodule.AnotherSubmodule"],
      "exactMatch",
    );
  });

  it("Possible import completions", async () => {
    const source = `
--@ Module.elm
module Module exposing (..)

func = ""

--@ Module/Submodule.elm
module Module.Submodule exposing (..)

func = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

func = ""

--@ Test.elm
module Test exposing (..)

import Module.{-caret-}

`;

    await testCompletions(
      source,
      ["Submodule", "Submodule.AnotherSubmodule"],
      "exactMatch",
      "triggeredByDot",
    );

    const source2 = `
--@ Module.elm
module Module exposing (..)

func = ""

--@ Module/Submodule.elm
module Module.Submodule exposing (..)

func = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

func = ""

--@ Test.elm
module Test exposing (..)

import Module.Sub{-caret-}

`;

    await testCompletions(
      source2,
      ["Submodule", "Submodule.AnotherSubmodule"],
      "exactMatch",
    );

    const source3 = `
--@ Module.elm
module Module exposing (..)

func = ""

--@ Module/Submodule.elm
module Module.Submodule exposing (..)

func = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

func = ""

--@ Test.elm
module Test exposing (..)

import {-caret-}

`;

    await testCompletions(
      source3,
      ["Module", "Module.Submodule", "Module.Submodule.AnotherSubmodule"],
      "exactMatch",
    );
  });

  it("Imported qualified modules should have value completions", async () => {
    const source = `
--@ Module.elm
module Module exposing (..)

testFunc = ""

type Msg = Msg1 | Msg2

type alias Model = { field : String }

--@ Test.elm
module Test exposing (..)

import Module

test = div [] [ Module.{-caret-} ]
`;

    await testCompletions(
      source,
      ["testFunc", "Msg", "Msg1", "Msg2", "Model"],
      "exactMatch",
      "triggeredByDot",
    );

    const source2 = `
--@ Module.elm
module Module exposing (..)

testFunc = ""

type Msg = Msg1 | Msg2

type alias Model = { field : String }

--@ Test.elm
module Test exposing (..)

import Module

test = Module.fu{-caret-}
`;

    await testCompletions(
      source2,
      ["testFunc", "Msg", "Msg1", "Msg2", "Model"],
      "exactMatch",
    );

    const source3 = `
--@ Module.elm
module Module exposing (..)

testFunc = ""

type Msg = Msg1 | Msg2

type alias Model = { field : String }

--@ Test.elm
module Test exposing (..)

import Module

test = Module.{-caret-}
`;

    await testCompletions(
      source3,
      ["testFunc", "Msg", "Msg1", "Msg2", "Model"],
      "exactMatch",
      "triggeredByDot",
    );
  });

  it("Non imported qualified modules should have value completions with auto imports", async () => {
    const source = `
--@ Module.elm
module Module exposing (..)

testFunc = ""

type Msg = Msg1 | Msg2

type alias Model = { field : String }

--@ Test.elm
module Test exposing (..)

test = div [] [ Module.{-caret-} ]
`;

    await testCompletions(
      source,
      [
        {
          label: "testFunc",
          detail: "Auto import module 'Module'",
          additionalTextEdits: [
            TextEdit.insert(Position.create(1, 0), "import Module\n"),
          ],
        },
        {
          label: "Msg",
          detail: "Auto import module 'Module'",
          additionalTextEdits: [
            TextEdit.insert(Position.create(1, 0), "import Module\n"),
          ],
        },
        {
          label: "Msg1",
          detail: "Auto import module 'Module'",
          additionalTextEdits: [
            TextEdit.insert(Position.create(1, 0), "import Module\n"),
          ],
        },
        {
          label: "Msg2",
          detail: "Auto import module 'Module'",
          additionalTextEdits: [
            TextEdit.insert(Position.create(1, 0), "import Module\n"),
          ],
        },
        {
          label: "Model",
          detail: "Auto import module 'Module'",
          additionalTextEdits: [
            TextEdit.insert(Position.create(1, 0), "import Module\n"),
          ],
        },
      ],
      "exactMatch",
      "triggeredByDot",
    );
  });

  // Ref: https://github.com/elm-tooling/elm-language-server/issues/288
  it("Record completions should not interfere with Module completions", async () => {
    const source = `
--@ Other.elm
module Other exposing (..)

testFunc = ""

type alias Data = { prop : String }

--@ Test.elm
module Test exposing (..)

import Other

type alias Model = 
{ prop1: String
, prop2: Int
}

view : Model -> Model
view model =
  let
    var = Other.{-caret-}

    test = model.prop1
  in
    model
`;

    await testCompletions(
      source,
      ["testFunc", "Data"],
      "exactMatch",
      "triggeredByDot",
    );
  });

  it("Complete used but undefined functions", async () => {
    const source = `
module Main exposing (..)

import Json.Encode


type alias Scope =
  { user : User
  }


type alias User =
  { name : String
  }


encodeScope : Scope -> Json.Encode.Value
encodeScope scope =
  Json.Encode.object
  [ ( "tag", Json.Encode.string "Scope" )
  , ( "user", encodeUser scope.user )
  ]

{-caret-}
  `;

    await testCompletions(
      source,
      ["encodeUser", "func encodeUser"],
      "partialMatch",
      "normal",
    );
  });

  it("Complete used but undefined functions, remove funcs exported from other file", async () => {
    const source = `
module Main exposing (..)

import Json.Encode exposing (string)


type alias Scope =
  { user : User
  }


type alias User =
  { name : String
  }


encodeScope : Scope -> Json.Encode.Value
encodeScope scope =
  Json.Encode.object
  [ ( "tag", string "Scope" )
  , ( "user", encodeUser scope.user )
  ]

{-caret-}
  `;

    await testCompletions(
      source,
      ["encodeUser", "func encodeUser"],
      "partialMatch",
      "normal",
    );
  });

  it("Record access in list expression", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: String
  , prop2: Int
  }

map: (a -> b) -> List a -> List b
map func list =
  list

func : List Model -> List a
func model =
    map (\\m -> m.{-caret-}) model
`;

    await testCompletions(source, ["prop1", "prop2"], "exactMatch");
  });

  it("Record access of a destructed union constructor", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


type State
    = State { field1 : String, field2 : String }


func : State -> a
func (State state) =
    [ state.{-caret-} ]
`;

    await testCompletions(source, ["field1", "field2"], "exactMatch");
  });

  it("Record access inside Maybe case of branch", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: String
  , prop2: Int
  }

type Maybe a = Just a | Nothing

func : Maybe Model -> a
func model =
    case model of
        Just m ->
            m.{-caret-}
`;

    await testCompletions(source, ["prop1", "prop2"], "exactMatch");
  });

  it("Record access destructured case branch", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model = 
  { prop1: Model2
  , prop2: Int
  }

type alias Model2 = 
  { field1: String 
  , field2: Int }

type Maybe a = Just a | Nothing

func : Maybe Model -> a
func model =
    case model of
        Just { prop1, prop2 } ->
            prop1.f{-caret-}

        Nothing ->
            ""
`;

    await testCompletions(source, ["field1", "field2"], "exactMatch");
  });

  it("Record completions in function params", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type Maybe a = Just { prop1: String, prop2: Int } | Nothing

func model =
    Just { p{-caret-} }
`;

    await testCompletions(source, ["prop1", "prop2"], "exactMatch");
  });

  it("Test dependencies should be seperate from normal ones", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

test =
    {-caret-}

--@ tests/TestFile.elm
module TestFile exposing (..)

func =
    ""
`;

    await testCompletions(
      source,
      [{ name: "func", shouldNotExist: true }],
      "partialMatch",
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

test =
    ""

--@ tests/TestFile.elm
module TestFile exposing (..)

func =
    ""

--@ tests/TestFile2.elm
module TestFile2 exposing (..)

func2 =
    {-caret-}
`;

    await testCompletions(source2, ["func", "test"], "partialMatch");
  });

  it("Record completions in record patterns", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func : { prop1: String, prop2: Int } -> String
func {{-caret-}} =
    ""
`;

    await testCompletions(source, ["prop1", "prop2"], "exactMatch");

    const source2 = `
--@ Test.elm
module Test exposing (..)

func : { prop1: String, prop2: Int } -> String
func {p{-caret-}} =
    ""
`;

    await testCompletions(source2, ["prop1", "prop2"], "exactMatch");

    const source3 = `
--@ Test.elm
module Test exposing (..)

func =
    let
      {{-caret-}} = { prop1 = "", prop2 = 2 }
    in
    ""
`;

    await testCompletions(source3, ["prop1", "prop2"], "exactMatch");
  });

  it("Case branch patterns should have completions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func model =
    case model of 
      Just { details } ->
        d{-caret-}
`;

    await testCompletions(source, ["details"]);
  });
});
