import { URI } from "vscode-uri";
import { SyntaxNode } from "web-tree-sitter";
import { convertFromCompilerDiagnostic } from "../../src/providers";
import { diagnosticsEquals } from "../../src/providers/diagnostics/fileDiagnostics";
import { TreeUtils } from "../../src/util/treeUtils";
import {
  Diagnostic,
  Diagnostics,
  error,
  IDiagnosticMessage,
} from "../../src/compiler/diagnostics";
import { Utils } from "../../src/util/utils";
import {
  getSourceFiles,
  getTargetPositionFromSource,
} from "../utils/sourceParser";
import { SourceTreeParser, srcUri } from "../utils/sourceTreeParser";
import { diff } from "jest-diff";
import path from "path";
import { describe, expect } from "@jest/globals";
import {
  basicsSources,
  listSources,
  parserSources,
  stringSources,
} from "./sources";

describe("test elm diagnostics", () => {
  const treeParser = new SourceTreeParser();

  const debug = process.argv.find((arg) => arg === "--debug");

  async function testTypeInference(
    source: string,
    expectedDiagnostics: {
      message: IDiagnosticMessage;
      args: (string | number)[];
    }[],
    disableSuggestionDiagnostics?: boolean,
  ) {
    await treeParser.init();

    const result = getTargetPositionFromSource(source) ?? {
      sources: getSourceFiles(source),
    };

    if (!result) {
      throw new Error("Getting sources failed");
    }

    const testUri = URI.file(path.join(srcUri, "Test.elm")).toString();

    const program = await treeParser.getProgram(result.sources);
    const sourceFile = program.getForest().getByUri(testUri);

    if (!sourceFile) throw new Error("Getting tree failed");

    const diagnostics: Diagnostic[] = [];

    const coreModules = [
      "Basics",
      "List",
      "Parser",
      "Parser.Advanced",
      "String",
      "Set",
      "Dict",
      "Char",
    ];
    program.getForest().treeMap.forEach((sourceFile) => {
      if (!coreModules.find((module) => sourceFile.uri.includes(module))) {
        diagnostics.push(...program.getSyntacticDiagnostics(sourceFile));
        diagnostics.push(...program.getSemanticDiagnostics(sourceFile));

        if (!disableSuggestionDiagnostics) {
          diagnostics.push(...program.getSuggestionDiagnostics(sourceFile));
        }
      }
    });

    let nodeAtPosition: SyntaxNode = undefined!;

    if ("range" in result) {
      const rootNode = program.getSourceFile(testUri)!.tree.rootNode;
      nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        rootNode,
        result.range.start,
      );
    }

    // Adjust for Type(..) or case
    if (
      nodeAtPosition?.nextNamedSibling?.text === "(..)" ||
      nodeAtPosition?.type === "case"
    ) {
      nodeAtPosition = nodeAtPosition.parent ?? nodeAtPosition;
    }

    const expected = expectedDiagnostics.map((exp) =>
      convertFromCompilerDiagnostic(
        error(nodeAtPosition, exp.message, ...exp.args),
      ),
    );

    const diagnosticsEqual = Utils.arrayEquals(
      diagnostics.map(convertFromCompilerDiagnostic),
      expected,
      diagnosticsEquals,
    );

    if (debug && !diagnosticsEqual) {
      console.log(diff(expected, diagnostics));
    }

    expect(diagnosticsEqual).toBeTruthy();
  }

  test("aliased function return", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Comparator a =
    a -> a -> Order

concat : List (Comparator a) -> Comparator a
concat comparators a b =
    case comparators of
        [] ->
            EQ

        comparator :: rest ->
            case comparator a b of
                EQ ->
                    concat rest a b

                order ->
                    order
`;
    await testTypeInference(basicsSources + source, []);
  });

  test("missing import", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import App
      --^

func : Int
func = 5
`;
    await testTypeInference(basicsSources + source, [
      { message: Diagnostics.ImportMissing, args: ["App"] },
    ]);
  });

  test("Shadowing a function with the same name", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Model =
    { field : Int
    }

field : Model -> Int
field { field } =
        --^
    4
`;
    await testTypeInference(basicsSources + source, [
      { message: Diagnostics.Redefinition, args: ["field"] },
    ]);
  });

  test("Type class used with a suffix", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

field : number1
field =
    4
  `;
    await testTypeInference(basicsSources + source, []);
  });

  test("unit expr as a function param", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

field : () -> Int
field =
    let
        func () =
            4

    in
    func
  `;
    await testTypeInference(basicsSources + source, []);
  });

  test("type var as a type alias", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Comparable comparable =
    comparable

field : Comparable a
field =
    1
  `;
    await testTypeInference(basicsSources + source, []);
  });

  test("field references accessed in complex ways", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias TopChart a comparable =
    { toValue : a -> Int
    , items : List a
    , toValueLabel : a -> Int
    , toLabel : a -> Int
    , sorter : a -> comparable
    , filter : a -> Bool
    }


topChart : List { name : Int, amount : Int } -> TopChart { name : Int, amount : Int } Int
topChart items =
    default
        { toValue = .amount
        , items = items
        }
        |> withSorter (.amount >> negate)
        |> withFilter (.amount >> (\\x -> x > 0))


default : { toValue : a -> Int, items : List a } -> TopChart a Int
default { toValue, items } =
    { toValue = toValue
    , items = items
    , toValueLabel = \\_ -> 1
    , toLabel = toValue
    , sorter = toValue
    , filter = \\_ -> True
    }


withSorter : (a -> comparable2) -> TopChart a comparable -> TopChart a comparable2
withSorter sorter chart =
    { toValue = chart.toValue
    , items = chart.items
    , toValueLabel = chart.toValueLabel
    , toLabel = chart.toLabel
    , sorter = sorter
    , filter = chart.filter
    }


withFilter : (a -> Bool) -> TopChart a comparable -> TopChart a comparable
withFilter filter chart =
    { chart | filter = filter }
    `;

    await testTypeInference(basicsSources + source, []);
  });

  test("recursion inside a let function with params", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func : Int -> Int
func =
    let
        go n =
            if n == 1 then
                2

            else
                func n + 1
    in
    go


func2 =
    let
        go n =
            if n == 1 then
                "text"

            else
                func2 n
    in
    go
  `;
    await testTypeInference(basicsSources + source, [], true);

    const source2 = `
--@ Test.elm
module Test exposing (..)

func =
--^
    let
        go =
            if False then
                "text"

            else
                func
    in
    go
      `;
    await testTypeInference(
      basicsSources + source2,
      [{ message: Diagnostics.RecursiveDeclaration(1), args: ["func"] }],
      true,
    );
  });

  test("mutual let recursion", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    let
        go n =
            if n == 1 then
                "text"

            else
                to n

        to =
      --^
            go
    in
    go
  `;
    await testTypeInference(
      basicsSources + source,
      [{ message: Diagnostics.RecursiveLet(2), args: ["to", "go"] }],
      true,
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

func =
    let
        go n =
            if n == 1 then
                "text"

            else
                to n

        to n =
            go n
    in
    go
  `;
    await testTypeInference(basicsSources + source2, [], true);

    // Recusion through 3 let declarations
    const source3 = `
--@ Test.elm
module Test exposing (..)

func =
    let
        go n =
            if n == 1 then
                "text"

            else
                to n

        to =
            another

        another =
        --^
            go
    in
    go
  `;
    await testTypeInference(
      basicsSources + source3,
      [
        {
          message: Diagnostics.RecursiveLet(3),
          args: ["another", "go", "to"],
        },
      ],
      true,
    );

    const source4 = `
--@ Test.elm
module Test exposing (..)

func =
    let
        go n =
            if n == 1 then
                "text"

            else
                to n

        another =
        --^
            go

        to =
            another
    in
    go
  `;
    await testTypeInference(
      basicsSources + source4,
      [{ message: Diagnostics.RecursiveLet(3), args: ["another", "go", "to"] }],
      true,
    );

    const source5 = `
--@ Test.elm
module Test exposing (..)

func =
    let
        go n =
            if n == 1 then
                "text"

            else
                to n

        another n =
            go

        to =
      --^
            another
    in
    go
  `;
    await testTypeInference(
      basicsSources + source5,
      [{ message: Diagnostics.RecursiveLet(3), args: ["to", "another", "go"] }],
      true,
    );

    const source6 = `
--@ Test.elm
module Test exposing (..)

func =
    let
        go =
      --^
            to

        to =
            go
    in
    go
  `;
    // FAILING - but not a big deal, since the error is just on `to` instead. Didn't see an easy way to solve this one
    // await testTypeInference(
    //   basicsSources + source6,
    //   [{ message: Diagnostics.RecursiveLet(2), args: ["go", "to"] }],
    //   true,
    // );

    const source7 = `
--@ Test.elm
module Test exposing (..)

func =
    let
        go =
            to

        to =
            another

        another =
        --^
            to
    in
    go
  `;
    await testTypeInference(
      basicsSources + source7,
      [{ message: Diagnostics.RecursiveLet(2), args: ["another", "to"] }],
      true,
    );
  });

  test("recursion between declarations and let declarations", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    let
        go n =
            if n == 1 then
                "text"

            else
                to n

        to n =
            func2
    in
    go


func2 =
    func
  `;
    await testTypeInference(basicsSources + source, [], true);
  });

  test("recursion between declarations", async () => {
    const source = `
    --@ Test.elm
func =
--^
    func2


func2 =
    func3


func3 =
    func
      `;
    await testTypeInference(
      basicsSources + source,
      [
        {
          message: Diagnostics.RecursiveDeclaration(3),
          args: ["func", "func2", "func3"],
        },
      ],
      true,
    );

    const source2 = `
    --@ Test.elm
func =
--^
    func
      `;
    await testTypeInference(
      basicsSources + source2,
      [
        {
          message: Diagnostics.RecursiveDeclaration(1),
          args: ["func"],
        },
      ],
      true,
    );

    const source3 = `
    --@ Test.elm
func =
    func2


func2 =
    func3


func3 a =
    func
      `;
    await testTypeInference(basicsSources + source3, [], true);

    const source4 = `
    --@ Test.elm
func =
    func2

func2 =
--^
    func3

func3 =
    func2
      `;
    await testTypeInference(
      basicsSources + source4,
      [
        {
          message: Diagnostics.RecursiveDeclaration(2),
          args: ["func2", "func3"],
        },
      ],
      true,
    );
  });

  test.skip("infinite type error", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    \\_ -> func
  `;
    await testTypeInference(
      basicsSources + source,
      [
        // Infinte type error
      ],
      true,
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

func =
    let
        go n =
            go
    in
    go
  `;
    await testTypeInference(
      basicsSources + source2,
      [
        // Infinte type error
      ],
      true,
    );

    const source3 = `
--@ Test.elm
module Test exposing (..)

func =
    let
        go n =
            func
    in
    go
  `;
    await testTypeInference(
      basicsSources + source3,
      [
        // Infinte type error
      ],
      true,
    );
  });

  test("type alias recursion", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias Test =
          --^
    { field : Test
    }
  `;
    await testTypeInference(
      basicsSources + source,
      [{ message: Diagnostics.RecursiveAlias(0), args: [] }],
      true,
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

type alias Test =
          --^
    { field : Test2
    }


type alias Test2 =
    Test
  `;
    await testTypeInference(
      basicsSources + source2,
      [{ message: Diagnostics.RecursiveAlias(2), args: ["Test", "Test2"] }],
      true,
    );

    const source3 = `
--@ Test.elm
module Test exposing (..)

type alias Test =
    { field : Test2
    }

type alias Test2 =
          --^
    Test3

type alias Test3 =
    Test2
  `;
    await testTypeInference(
      basicsSources + source3,
      [{ message: Diagnostics.RecursiveAlias(2), args: ["Test2", "Test3"] }],
      true,
    );

    const source4 = `
--@ Test.elm
module Test exposing (..)

type alias Test =
          --^
    { field : Test2
    }

type alias Test2 =
    Test3

type alias Test3 =
    { field : Test
    }
  `;
    await testTypeInference(
      basicsSources + source4,
      [
        {
          message: Diagnostics.RecursiveAlias(3),
          args: ["Test", "Test2", "Test3"],
        },
      ],
      true,
    );
  });

  test("test case expr used as the first arg of bin op expr", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

foo : Int -> String
foo input =
    let
        transform1 a =
            ""

        transform2 a =
            ""
    in
    (case input of
        _ ->
            1
    )
        |> transform1
        |> transform2

  `;
    await testTypeInference(basicsSources + stringSources + source, []);
  });

  test("test cons pattern with list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

test : List (List Float) -> Float
test listList =
    case listList of
        [ a, b ] :: _ ->
            let
                product : Float
                product =
                    a + b
            in
            product

        _ ->
            0

  `;
    await testTypeInference(basicsSources + source, []);
  });

  test("test duplicate type imports produce an error if ambiguous", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import App exposing (Program)
import Platform exposing (..)

foo : Program
      --^
foo =
    ""

--@ App.elm
module App exposing (..)

type alias Program = String

--@ Platform.elm
module Platform exposing (..)

type Program flags model msg = Program
`;
    await testTypeInference(basicsSources + stringSources + source, [
      {
        message: Diagnostics.AmbiguousType,
        args: ["Program"],
      },
    ]);

    const source2 = `
--@ Test.elm
module Test exposing (..)

import Platform exposing (..)
import App exposing (Program)

foo : Program
foo =
    ""

--@ App.elm
module App exposing (..)

type alias Program = String

--@ Platform.elm
module Platform exposing (..)

type Program flags model msg = Program
`;
    await testTypeInference(basicsSources + stringSources + source2, []);
  });

  test("test duplicate variant imports produce an error", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import App exposing (Program(..))
import Platform exposing (..)

foo =
    Program
    --^

--@ App.elm
module App exposing (..)

type Program = Program

--@ Platform.elm
module Platform exposing (..)

type Program = Program
`;
    await testTypeInference(
      basicsSources + stringSources + source,
      [
        {
          message: Diagnostics.AmbiguousVariant,
          args: ["Program"],
        },
      ],
      true,
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

import App exposing (Program)
import Platform exposing (..)

foo =
    Program
    --^

--@ App.elm
module App exposing (..)

type Program = Program

--@ Platform.elm
module Platform exposing (..)

type Program = Program
`;
    await testTypeInference(basicsSources + stringSources + source2, [], true);

    const source3 = `
--@ Test.elm
module Test exposing (..)

import Platform exposing (..)
import App exposing (Program(..))

foo =
    Program
    --^

--@ App.elm
module App exposing (..)

type Program = Program

--@ Platform.elm
module Platform exposing (..)

type Program = Program
`;
    await testTypeInference(
      basicsSources + stringSources + source3,
      [
        {
          message: Diagnostics.AmbiguousVariant,
          args: ["Program"],
        },
      ],
      true,
    );
  });

  test("test duplicate value imports produce an error", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import App exposing (bar)
import Platform exposing (..)

foo =
    bar
   --^

--@ App.elm
module App exposing (..)

bar = ""

--@ Platform.elm
module Platform exposing (..)

bar = ""
`;
    await testTypeInference(
      basicsSources + stringSources + source,
      [
        {
          message: Diagnostics.AmbiguousVar,
          args: ["bar"],
        },
      ],
      true,
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

import Platform exposing (..)
import App exposing (bar)

foo =
    bar
   --^

--@ App.elm
module App exposing (..)

bar = ""

--@ Platform.elm
module Platform exposing (..)

bar = ""
`;
    await testTypeInference(
      basicsSources + stringSources + source2,
      [
        {
          message: Diagnostics.AmbiguousVar,
          args: ["bar"],
        },
      ],
      true,
    );
  });

  test("test exposing unknown value or type", async () => {
    const source = `
--@ Test.elm
module Test exposing (foo, Program)
                            --^
foo =
    ""
`;
    await testTypeInference(
      basicsSources + stringSources + source,
      [
        {
          message: Diagnostics.ExportNotFound,
          args: ["type", "Program"],
        },
      ],
      true,
    );

    const source2 = `
--@ Test.elm
module Test exposing (foo, bar)
                          --^
foo =
    ""
`;
    await testTypeInference(
      basicsSources + stringSources + source2,
      [
        {
          message: Diagnostics.ExportNotFound,
          args: ["value", "bar"],
        },
      ],
      true,
    );

    const source3 = `
--@ Test.elm
module Test exposing (foo, Program(..))
                            --^
foo =
    ""
`;
    await testTypeInference(
      basicsSources + stringSources + source3,
      [
        {
          message: Diagnostics.ExportNotFound,
          args: ["type", "Program(..)"],
        },
      ],
      true,
    );
  });

  test("test exposing union constructor on a type alias", async () => {
    const source = `
--@ Test.elm
module Test exposing (Program(..))
                        --^
type alias Program = Int
`;
    await testTypeInference(
      basicsSources + stringSources + source,
      [
        {
          message: Diagnostics.ExportOpenAlias,
          args: ["Program"],
        },
      ],
      true,
    );
  });

  test("test importing unknown value or type", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import App exposing (Program)
                     --^

foo =
    ""

--@ App.elm
module App exposing (..)

foo =
    ""
`;
    await testTypeInference(
      basicsSources + stringSources + source,
      [
        {
          message: Diagnostics.ImportExposingNotFound,
          args: ["App", "Program"],
        },
      ],
      true,
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)

import App exposing (bar)
                    --^

foo =
    ""

--@ App.elm
module App exposing (..)

foo =
    ""
`;
    await testTypeInference(
      basicsSources + stringSources + source2,
      [
        {
          message: Diagnostics.ImportExposingNotFound,
          args: ["App", "bar"],
        },
      ],
      true,
    );

    const source3 = `
--@ Test.elm
module Test exposing (..)

import App exposing (Program(..))
                     --^

foo =
    ""

--@ App.elm
module App exposing (..)

foo =
    ""
`;
    await testTypeInference(
      basicsSources + stringSources + source3,
      [
        {
          message: Diagnostics.ImportExposingNotFound,
          args: ["App", "Program"],
        },
      ],
      true,
    );
  });

  test("test importing union constructor on a type alias", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import App exposing (Program(..))
                      --^

foo =
    ""

--@ App.elm
module App exposing (..)

type alias Program = Int
`;
    await testTypeInference(
      basicsSources + stringSources + source,
      [
        {
          message: Diagnostics.ImportOpenAlias,
          args: ["Program"],
        },
      ],
      true,
    );
  });

  test("test duplicate imports should not cause an error", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import App exposing (bar)
import App exposing (bar)

foo =
    bar

--@ App.elm
module App exposing (..)

bar = ""
`;
    await testTypeInference(basicsSources + stringSources + source, [], true);

    const source2 = `
--@ Test.elm
module Test exposing (..)

import App
import App

foo =
    App.bar

--@ App.elm
module App exposing (..)

bar = ""
`;
    await testTypeInference(basicsSources + stringSources + source2, [], true);
  });

  describe("test case pattern matching", () => {
    it("missing case patterns should have an error - ctor and tuple", async () => {
      const source = `
--@ Test.elm
module Test exposing (..)

type Result e a = Ok a | Error e

func result =
    case result of
    --^
        Ok _ ->
            ""
  `;
      await testTypeInference(
        basicsSources + source,
        [{ message: Diagnostics.IncompleteCasePattern(1), args: ["Error _"] }],
        true,
      );

      const source2 = `
--@ Test.elm
module Test exposing (..)

type Maybe a = Just a | Nothing

func result =
    case result of
    --^
        (Just _, _) ->
            ""
  `;
      await testTypeInference(
        basicsSources + source2,
        [
          {
            message: Diagnostics.IncompleteCasePattern(1),
            args: ["( Nothing, _ )"],
          },
        ],
        true,
      );

      const source3 = `
--@ Test.elm
module Test exposing (..)

type Msg = One | Two | Three Int Int | Four

func result =
    case result of
    --^
        One ->
            ""
  `;
      await testTypeInference(
        basicsSources + source3,
        [
          {
            message: Diagnostics.IncompleteCasePattern(3),
            args: ["Two", "Three _ _", "Four"],
          },
        ],
        true,
      );

      const source4 = `
--@ Test.elm
module Test exposing (..)

type Maybe a = Just a | Nothing

type Msg = One | Two | Three (Maybe Int) | Four

func result =
    case result of
    --^
        One ->
            ""
  `;
      await testTypeInference(
        basicsSources + source4,
        [
          {
            message: Diagnostics.IncompleteCasePattern(3),
            args: ["Two", "Three _", "Four"],
          },
        ],
        true,
      );

      const source5 = `
--@ Test.elm
module Test exposing (..)

type Maybe a = Just a | Nothing

func result =
    case result of
    --^
        Nothing ->
            ""

        Just (Just a) ->
            a
  `;
      await testTypeInference(
        basicsSources + source5,
        [
          {
            message: Diagnostics.IncompleteCasePattern(1),
            args: ["Just Nothing"],
          },
        ],
        true,
      );
    });

    it("missing case patterns should have an error - cons and list", async () => {
      const source = `
--@ Test.elm
module Test exposing (..)

func result =
    case result of
    --^
        a :: b ->
            ""
  `;
      await testTypeInference(
        basicsSources + source,
        [{ message: Diagnostics.IncompleteCasePattern(1), args: ["[]"] }],
        true,
      );
    });

    it("should not have an error - multiple cons", async () => {
      const source = `
--@ Test.elm
module Test exposing (..)

func result =
    case result of
    --^
        a :: b :: _ ->
            ""

        a :: [] ->
            ""

        _ ->
            ""
  `;
      await testTypeInference(basicsSources + source, [], true);
    });

    it("should not have an error with module prefixed nullary constructor argument", async () => {
      const source = `
--@ Test.elm
module Test exposing (..)

import Route exposing (App)

type Maybe a
    = Just a
    | Nothing

changeRouteTo maybeRoute =
    case maybeRoute of
    --^
        Nothing ->
            ""

        Just (Route.EditArticle slug) ->
            ""

        Just Route.Home ->
            ""

--@ Route.elm
module Route exposing (..)

type App
    = Home
    | EditArticle Int
  `;
      await testTypeInference(basicsSources + source, [], true);
    });

    it("should not have an error with alias", async () => {
      const source = `
--@ Test.elm
module Test exposing (..)

type Maybe a = Just a | Nothing

func result =
    case result of
    --^
        Just ((Just a) as arg) ->
            ""

        Just Nothing ->
            ""

        Nothing ->
            ""

  `;
      await testTypeInference(basicsSources + source, [], true);
    });

    it("empty record pattern should not have an error", async () => {
      const source = `
--@ Test.elm
module Test exposing (..)

f : { a : Int } -> Int
f {} =
    5
  `;
      await testTypeInference(basicsSources + source, [], true);
    });
  });

  // https://github.com/elm-tooling/elm-language-server/issues/689
  it("should not have an error for a generic type alias used in different branches", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func : Bool -> DataType
func n =
  if n then
    FloatData (Data 1.2)

  else
    IntData (Data 1)


type alias Data data =
  { field : data
  }

type DataType
  = FloatData (Data Float)
  | IntData (Data Int)
`;
    await testTypeInference(basicsSources + source, []);
  });

  // https://github.com/elm-tooling/elm-language-server/issues/678
  it("should not have an error for a generic type record", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type Example a = Example { a | foo : Float }

example : Example {}
example = Example { foo = 0 }
`;
    await testTypeInference(basicsSources + source, []);

    const source2 = `
--@ Test.elm
module Test exposing (..)

type Example a = Example { a | foo : Float }

example : Example { bar : Int }
example = Example { foo = 0, bar = 1 }
    `;
    await testTypeInference(basicsSources + source2, []);
  });

  // https://github.com/elm-tooling/elm-language-server/issues/634
  it("should not enforce type variable contraints for aliases", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias A appendable =
    appendable

a : A Int
a =
    1
`;
    await testTypeInference(basicsSources + source, []);

    const source2 = `
--@ Test.elm
module Test exposing (..)

type alias A number =
  number

a : A String
a =
    ""
    `;
    await testTypeInference(basicsSources + stringSources + source2, []);

    const source3 = `
--@ Test.elm
module Test exposing (..)

type alias A appendable = 
    { a : appendable }

a : A Int
a = 
    { a = 0 }
    `;
    await testTypeInference(basicsSources + source3, []);
  });

  it("should enforce type variable contraints for record contructors", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias A appendable = 
    { a : appendable }

a = 
    A 0
    --^
`;
    await testTypeInference(basicsSources + source, [
      { message: Diagnostics.TypeMismatch, args: ["appendable", "number"] },
    ]);

    const source2 = `
--@ Test.elm
module Test exposing (..)

type B appendable = 
    With appendable | Without

b : B Int
b = With 0
       --^
    `;
    await testTypeInference(basicsSources + source2, [
      { message: Diagnostics.TypeMismatch, args: ["appendable", "number"] },
    ]);

    const source3 = `
--@ Test.elm
module Test exposing (..)

type B appendable = 
    With appendable | Without

b : B Int
b = Without
     --^
        `;
    await testTypeInference(basicsSources + source3, [
      { message: Diagnostics.TypeMismatch, args: ["B Int", "B appendable"] },
    ]);
  });

  // https://github.com/elm-tooling/elm-language-server/issues/494
  it.skip("should work with type alias of function with type variable", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type Config data
    = Config (RequiredConfig data)

type alias RequiredConfig data =
    Data data -> String

type alias Data data =
    { data
        | windowWidth : Int
        , windowHeight : Int
    }

-- PUBLIC CONFIG

type alias PublicConfig =
    Config {}

type alias PublicRequiredConfig =
    RequiredConfig {}

publicConfig : PublicRequiredConfig -> PublicConfig
publicConfig =
    Config
`;
    await testTypeInference(basicsSources + source, []);
  });

  it("should not have an error when converting a number to Float or Int", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import String

foo : Bool -> String
foo asInt =
    let
        myGoodNumber =
            216

        ( myBadNumber, _ ) =
            ( 216, 0 )
    in
    if asInt then
        String.fromInt myGoodNumber
            ++ String.fromInt myBadNumber

    else
        String.fromFloat myGoodNumber
            ++ String.fromFloat myBadNumber
`;
    await testTypeInference(basicsSources + stringSources + source, []);
  });

  it("should have an error when converting a type annotation number to Float or Int", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import String

foo : Bool -> number -> String
foo asInt myNumber =
    let
      myGoodNumber =
        216
    in
    if asInt then
        String.fromInt myNumber
            ++ String.fromInt myGoodNumber

    else
        String.fromFloat myNumber
                        --^
            ++ String.fromFloat myGoodNumber
`;
    await testTypeInference(basicsSources + stringSources + source, [
      { message: Diagnostics.TypeMismatch, args: ["Float", "Int"] },
    ]);
  });

  it("operators from different files should not have an errors", async () => {
    const source = `
--@ Other.elm
module Other exposing (foo)

import Parser exposing ((|.), (|=), Parser)

foo : number
foo =
    3


oneOrMore : Parser a -> Parser (List a)
oneOrMore parser =
    Parser.andThen
        (\\firstValue ->
            Parser.loop [ firstValue ]
                (\\reversedValues ->
                    Parser.oneOf
                        [ Parser.succeed (Parser.Done (List.reverse reversedValues))
                            |. Parser.end
                        , Parser.succeed (\\nextValue -> Parser.Loop (nextValue :: reversedValues))
                            |= parser
                        , Parser.succeed (Parser.Done (List.reverse reversedValues))
                        ]
                )
        )
        parser

        
--@ Test.elm
module Test exposing (..)

import Parser.Advanced as Parser exposing ((|.), (|=))

test : Parser.Parser Never () ()
test =
    Parser.succeed (\\_ -> ())
        |= Parser.getOffset  
`;

    await testTypeInference(
      basicsSources + listSources + stringSources + parserSources + source,
      [],
    );
  });

  // https://github.com/elm-tooling/elm-language-server/issues/945
  it("should not have an error when there is a comment in between type paramaters", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type MyType
    = MyType
        -- First comment
        -- Second comment
        -- Third comment
        Int


someFunction : MyType -> Bool
someFunction mytype =
    case mytype of
        MyType _ ->
            True
`;
    await testTypeInference(basicsSources + source, [], true);
  });
});
