import path from "path";
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
import { baseUri, SourceTreeParser, srcUri } from "./utils/sourceTreeParser";

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

    const { newSources, position, fileWithCaret } =
      getCaretPositionFromSource(source);

    if (!position) {
      throw new Error("Getting position failed");
    }

    const testUri = URI.file(
      path.join(
        fileWithCaret.startsWith("tests") ? baseUri : srcUri,
        fileWithCaret,
      ),
    ).toString();

    const program = await treeParser.getProgram(newSources);
    const sourceFile = program.getSourceFile(testUri);

    function testCompletionsWithContext(context: CompletionContext): void {
      if (!sourceFile) throw new Error("Getting source file failed");

      const completions =
        completionProvider.handleCompletion({
          textDocument: { uri: testUri },
          position,
          context,
          program,
          sourceFile,
        }) ?? [];

      const completionsList = (
        Array.isArray(completions) ? completions : completions.items
      ).sort((a, b) => {
        if (a.sortText && b.sortText) {
          return a.sortText.localeCompare(b.sortText);
        }

        if (a.sortText) {
          return -1;
        }

        if (b.sortText) {
          return 1;
        }

        return a.label.localeCompare(b.label);
      });

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

      let lastFoundIndex = -1;
      expectedCompletions.forEach((completion) => {
        const foundIndex = completionsList.findIndex((c) => {
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

        const result = foundIndex >= 0;

        // Flip result if it should not exist
        if (
          typeof completion === "object" &&
          "shouldNotExist" in completion &&
          completion.shouldNotExist
        ) {
          expect(result).toBe(false);
          return;
        }

        if (!result && debug) {
          console.log(
            `Could not find ${completion} in ${JSON.stringify(
              completionsList,
            )}`,
          );
        }

        expect(result).toBe(true);

        if (foundIndex <= lastFoundIndex && debug) {
          console.log(
            `Completion ${
              typeof completion === "object" && "label" in completion
                ? completion.label
                : completion
            } was in the wrong order. Completion order is [ ${completionsList
              .map((c) => c.label)
              .join(", ")} ]`,
          );
        }

        expect(foundIndex).toBeGreaterThan(lastFoundIndex);
        lastFoundIndex = foundIndex;
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
      ["Msg", "testFunction", "TestType"],
      "exactMatch",
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (testFunction, {-caret-})
`;

    await testCompletions(
      otherSource + source2,
      ["Msg", "testFunction", "TestType"],
      "exactMatch",
    );

    const source3 = `
--@ Test.elm
module Test exposing (..)

import OtherModule exposing (testFunction, T{-caret-})
`;

    await testCompletions(
      otherSource + source3,
      ["Msg", "testFunction", "TestType"],
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
      ["Msg", "Msg(..)", "Msg1", "Msg2", "testFunc", "TestType"],
      "exactMatch",
    );

    const source2 = `
--@ Test.elm
module Test exposing (t{-caret-})

testFunc : String
testFunc =
  ""

type Msg = Msg1 | Msg2

type alias TestType =
  { prop : String }
`;

    await testCompletions(
      source2,
      ["Msg", "Msg(..)", "Msg1", "Msg2", "testFunc", "TestType"],
      "exactMatch",
    );
  });

  it("Module exposing list should not have completions for already exposed", async () => {
    const source = `
--@ Test.elm
module Test exposing (testFunc, Msg(..), {-caret-})

testFunc : String
testFunc =
  ""

type Msg = Msg1 | Msg2

type alias TestType =
  { prop : String }
`;

    await testCompletions(
      source,
      ["Msg", "Msg1", "Msg2", "TestType"],
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

testFunction : String
testFunction =
  ""

--@ Test.elm
module Test exposing (..)

import Data.User

test =
  {-caret-}
`;

    await testCompletions(
      source,
      ["Data.User.testFunction"],
      "partialMatch",
      "triggeredByDot",
    );

    const source2 = `
--@ Data/User.elm
module Data.User exposing (..)

testFunction : String
testFunction =
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
      ["Data.User.testFunction", "Data.User.TestType"],
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

testFunction = ""
`;

    await testCompletions(
      source,
      ["Away", "Home", "Page"],
      "exactMatch",
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
      ["Away", "Home", "Page"],
      "exactMatch",
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

testFunction = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

testFunction = ""

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

testFunction = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

testFunction = ""

--@ Test.elm
module Test exposing (..)

test = Module.Submodule.{-caret-}
    `;

    await testCompletions(
      source2,
      ["testFunction", "AnotherSubmodule"],
      "exactMatch",
      "triggeredByDot",
    );

    const source3 = `
--@ Module/Submodule.elm
module Module.Submodule exposing (..)

testFunction = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

testFunction = ""

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

testFunction = ""

--@ Module/Submodule.elm
module Module.Submodule exposing (..)

testFunction = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

testFunction = ""

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

testFunction = ""

--@ Module/Submodule.elm
module Module.Submodule exposing (..)

testFunction = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

testFunction = ""

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

testFunction = ""

--@ Module/Submodule.elm
module Module.Submodule exposing (..)

testFunction = ""

--@ Module/Submodule/AnotherSubmodule.elm
module Module.Submodule.AnotherSubmodule exposing (..)

testFunction = ""

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
      ["Model", "Msg", "Msg1", "Msg2", "testFunc"],
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
      ["Model", "Msg", "Msg1", "Msg2", "testFunc"],
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
      ["Model", "Msg", "Msg1", "Msg2", "testFunc"],
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
          label: "Model",
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
          label: "testFunc",
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

  it("Non imported qualified modules with aliases should have value completions with auto imports", async () => {
    const source = `
--@ Module/Foo.elm
module Module.Foo exposing (..)
testFunc = ""

type Msg = Msg1 | Msg2

type alias Model = { field : String }

--@ Test.elm
module Test exposing (..)
test = div [] [ Foo.{-caret-} ]
`;

    await testCompletions(
      source,
      [
        {
          label: "Model",
          detail: "Auto import module 'Module.Foo' as 'Foo'",
          additionalTextEdits: [
            TextEdit.insert(
              Position.create(1, 0),
              "import Module.Foo as Foo\n",
            ),
          ],
        },
        {
          label: "Msg",
          detail: "Auto import module 'Module.Foo' as 'Foo'",
          additionalTextEdits: [
            TextEdit.insert(
              Position.create(1, 0),
              "import Module.Foo as Foo\n",
            ),
          ],
        },
        {
          label: "Msg1",
          detail: "Auto import module 'Module.Foo' as 'Foo'",
          additionalTextEdits: [
            TextEdit.insert(
              Position.create(1, 0),
              "import Module.Foo as Foo\n",
            ),
          ],
        },
        {
          label: "Msg2",
          detail: "Auto import module 'Module.Foo' as 'Foo'",
          additionalTextEdits: [
            TextEdit.insert(
              Position.create(1, 0),
              "import Module.Foo as Foo\n",
            ),
          ],
        },
        {
          label: "testFunc",
          detail: "Auto import module 'Module.Foo' as 'Foo'",
          additionalTextEdits: [
            TextEdit.insert(
              Position.create(1, 0),
              "import Module.Foo as Foo\n",
            ),
          ],
        },
      ],
      "exactMatch",
      "triggeredByDot",
    );

    const source2 = `
--@ Module/Foo/Bar.elm
module Module.Foo.Bar exposing (..)
testFunc = ""

type Msg = Msg1 | Msg2

type alias Model = { field : String }

--@ Test.elm
module Test exposing (..)
test = div [] [ Bar.{-caret-} ]
`;

    await testCompletions(
      source2,
      [
        {
          label: "Model",
          detail: "Auto import module 'Module.Foo.Bar' as 'Bar'",
          additionalTextEdits: [
            TextEdit.insert(
              Position.create(1, 0),
              "import Module.Foo.Bar as Bar\n",
            ),
          ],
        },
        {
          label: "Msg",
          detail: "Auto import module 'Module.Foo.Bar' as 'Bar'",
          additionalTextEdits: [
            TextEdit.insert(
              Position.create(1, 0),
              "import Module.Foo.Bar as Bar\n",
            ),
          ],
        },
        {
          label: "Msg1",
          detail: "Auto import module 'Module.Foo.Bar' as 'Bar'",
          additionalTextEdits: [
            TextEdit.insert(
              Position.create(1, 0),
              "import Module.Foo.Bar as Bar\n",
            ),
          ],
        },
        {
          label: "Msg2",
          detail: "Auto import module 'Module.Foo.Bar' as 'Bar'",
          additionalTextEdits: [
            TextEdit.insert(
              Position.create(1, 0),
              "import Module.Foo.Bar as Bar\n",
            ),
          ],
        },
        {
          label: "testFunc",
          detail: "Auto import module 'Module.Foo.Bar' as 'Bar'",
          additionalTextEdits: [
            TextEdit.insert(
              Position.create(1, 0),
              "import Module.Foo.Bar as Bar\n",
            ),
          ],
        },
      ],
      "exactMatch",
      "triggeredByDot",
    );

    const source3 = `
--@ Module/Foo/Bar.elm
module Module.Foo.Bar exposing (..)
testFunc = ""

type Msg = Msg1 | Msg2

type alias Model = { field : String }

--@ Test.elm
module Test exposing (..)
test = div [] [ Foo.{-caret-} ]
`;

    await testCompletions(source3, [], "exactMatch", "triggeredByDot");
  });

  it("Non imported qualified modules should have value completions with auto imports after module docs", async () => {
    const source = `
--@ Module.elm
module Module exposing (..)
testFunc = ""

type Msg = Msg1 | Msg2

type alias Model = { field : String }

--@ Test.elm
module Test exposing (..)
{-| Test
-}

{-| test
-}
test = div [] [ Module.{-caret-} ]
`;

    await testCompletions(
      source,
      [
        {
          label: "Model",
          detail: "Auto import module 'Module'",
          additionalTextEdits: [
            TextEdit.insert(Position.create(3, 0), "import Module\n"),
          ],
        },

        {
          label: "Msg",
          detail: "Auto import module 'Module'",
          additionalTextEdits: [
            TextEdit.insert(Position.create(3, 0), "import Module\n"),
          ],
        },
        {
          label: "Msg1",
          detail: "Auto import module 'Module'",
          additionalTextEdits: [
            TextEdit.insert(Position.create(3, 0), "import Module\n"),
          ],
        },
        {
          label: "Msg2",
          detail: "Auto import module 'Module'",
          additionalTextEdits: [
            TextEdit.insert(Position.create(3, 0), "import Module\n"),
          ],
        },
        {
          label: "testFunc",
          detail: "Auto import module 'Module'",
          additionalTextEdits: [
            TextEdit.insert(Position.create(3, 0), "import Module\n"),
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
      ["Data", "testFunc"],
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

testFunction : List Model -> List a
testFunction model =
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


testFunction : State -> a
testFunction (State state) =
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

testFunction : Maybe Model -> a
testFunction model =
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

testFunction : Maybe Model -> a
testFunction model =
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

testFunction model =
    Just { p{-caret-} }
`;

    await testCompletions(source, ["prop1", "prop2"], "exactMatch");
  });

  it("Functions from other modules should be importable", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

test =
    {-caret-}

--@ TestFile.elm
module TestFile exposing (..)

testFunction =
    ""
`;

    await testCompletions(source, ["testFunction"], "partialMatch");
  });

  it("Test dependencies should not be found from normal ones", async () => {
    const source = `
    --@ Test.elm
module Test exposing (..)

test =
{-caret-}

--@ tests/TestFile.elm
module TestFile exposing (..)

testFunction =
    ""
`;

    await testCompletions(
      source,
      [{ name: "testFunction", shouldNotExist: true }],
      "partialMatch",
    );
  });

  it("Test dependencies should find each other and normal", async () => {
    const source2 = `
--@ Test.elm
module Test exposing (..)

test =
    ""

--@ tests/TestFile.elm
module TestFile exposing (..)

testFunction =
    ""

--@ tests/TestFile2.elm
module TestFile2 exposing (..)

testFunction2 =
    {-caret-}
`;

    await testCompletions(source2, ["testFunction", "test"], "partialMatch");
  });

  it("Record completions in record patterns", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

testFunction : { prop1: String, prop2: Int } -> String
testFunction {{-caret-}} =
    ""
`;

    await testCompletions(source, ["prop1", "prop2"], "exactMatch");

    const source2 = `
--@ Test.elm
module Test exposing (..)

testFunction : { prop1: String, prop2: Int } -> String
testFunction {p{-caret-}} =
    ""
`;

    await testCompletions(source2, ["prop1", "prop2"], "exactMatch");

    const source3 = `
--@ Test.elm
module Test exposing (..)

testFunction =
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

testFunction model =
    case model of
      Just { details } ->
        d{-caret-}
`;

    await testCompletions(source, ["details"]);
  });

  it("Completions for module alias if using an import alias", async () => {
    const source = `
--@ Module.elm
module Module exposing (..)

foo = ""

type Maybe a = Just a | Nothing

--@ Test.elm
module Test exposing (..)

import Module as M

testFunction =
    M.f{-caret-}
`;

    await testCompletions(
      source,
      ["foo", "Just", "Maybe", "Nothing"],
      "exactMatch",
    );
  });

  it("No completions for module if using an import alias", async () => {
    const source = `
--@ Module.elm
module Module exposing (..)

foo = ""

type Maybe a = Just a | Nothing

--@ Test.elm
module Test exposing (..)

import Module as M

testFunction =
    Module.f{-caret-}
`;

    await testCompletions(source, [], "exactMatch");
  });

  it("Multiple modules with the same name/alias should have all completions", async () => {
    const source = `
--@ Module.elm
module Module exposing (..)

foo = ""

type Maybe a = Just a | Nothing

--@ OtherModule.elm
module OtherModule exposing (..)

bar = ""

type Result e a = Ok a | Err e

--@ Test.elm
module Test exposing (..)

import Module as M
import OtherModule as M

testFunction =
    M.f{-caret-}
`;

    await testCompletions(
      source,
      ["bar", "Err", "foo", "Just", "Maybe", "Nothing", "Ok", "Result"],
      "exactMatch",
    );
  });

  it("Completions from default imports", async () => {
    const source = `
--@ List.elm
module List exposing (..)

singleton : a -> List a
singleton value =
  [value]

--@ Test.elm
module Test exposing (..)

testFunction =
    List.{-caret-}
`;

    await testCompletions(source, ["singleton"], "exactMatch");
  });

  it("Completions from default imports with alias", async () => {
    const source = `
--@ Platform/Cmd.elm
module Platform.Cmd exposing (Cmd, batch)

type Cmd msg = Cmd

batch : List (Cmd msg) -> Cmd msg
batch =
  Elm.Kernel.Platform.batch

--@ Test.elm
module Test exposing (..)

testFunction =
    Cmd.{-caret-}
`;

    await testCompletions(source, ["batch", "Cmd"], "exactMatch");
  });

  it("Completions from lambda function", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

testFunction : { field : Int } -> Int
testFunction =
    (\\param -> p{-caret-})
`;

    await testCompletions(source, ["param"]);
  });

  it("Completions from lambda function pattern", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

testFunction : { field : Int } -> Int
testFunction =
    (\\{ field } -> f{-caret-})
`;

    await testCompletions(source, ["field"]);
  });

  it("Destructed record function parameter", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model =
  { prop1: String
  , prop2: Int
  }

testFunction : Model -> a
testFunction { prop1, prop2 } =
    pr{-caret-}
`;

    await testCompletions(source, ["prop1", "prop2"], "partialMatch");
  });

  it("port completion", async () => {
    const source = `
--@ Test.elm
port module Test exposing (..)

x = 
    f{-caret-}

port foo : String -> Cmd msg

port fbar : (String -> msg) -> Sub msg
`;

    await testCompletions(source, ["fbar", "foo"], "partialMatch");
  });

  it("Completions for record fields", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model =
  { prop1: String
  , prop2: Int
  }

view : Model -> String
view model =
    m{-caret-}
`;

    await testCompletions(
      source,
      ["model.prop1", "model.prop2"],
      "partialMatch",
    );
  });
});
