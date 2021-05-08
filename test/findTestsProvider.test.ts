import { getSourceFiles } from "./utils/sourceParser";
import { SourceTreeParser, testUri } from "./utils/sourceTreeParser";
import { URI } from "vscode-uri";
import {
  findAllTestSuites,
} from "../src/providers/findTestsProvider";
import { TestSuite } from "../src/protocol";

const basicsSources = `
--@ Basics.elm
module Basics exposing ((<|),(++), Int, Float, Bool(..), Order(..), negate)

infix left  0 (<|) = apL
infix right 5 (++) = append

type Int = Int

type Float = Float

type Bool = True | False

add : number -> number -> number
add =
  Elm.Kernel.Basics.add

append : appendable -> appendable -> appendable
append =
  Elm.Kernel.Utils.append

apL : (a -> b) -> a -> b
apL f x =
  f x

--@ String.elm
module String exposing (String,append)

type String = String

append : String -> String -> String
append =
  Elm.Kernel.String.append 
`;

const sourceTestModule = `
--@ TestInternal.elm
module Test.Internal exposing (Test(..))

type Test = T

--@ Test.elm
module Test exposing (Test(..), describe, test, fuzz)

import Expect exposing (..)
import Test.Internal as Internal

type alias Test = Internal.Test

describe : String -> List Test -> Test
describe untrimmedDesc tests = T

test : String -> (() -> Expectation) -> Test
test untrimmedDesc thunk = T

fuzz : Fuzzer a -> String -> (a -> Expectation) -> Test
fuzz fuzzer desc thunk = T

--@ Expect.elm
module Expect exposing (Expectation(..), equal)

type Expectation = E

equal : a -> a -> Expectation
equal aa bb = E

--@ Fuzz.elm
module Fuzz exposing (int)

type Fuzzer a = F a

int Fuzzer Int
int = F 13
`;

describe("FindTestsProvider", () => {
  const treeParser = new SourceTreeParser();

  const testModuleUri = URI.file(testUri + "/MyModule.elm").toString();

  async function testFindTests(source: string, expected: TestSuite[]) {
    await treeParser.init();

    const sources = getSourceFiles(basicsSources + sourceTestModule + source);
    const program = await treeParser.getProgram(sources);

    const suites = findAllTestSuites(program)
    expect(suites).toEqual(expected);
  }

  test("empty", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test exposing (..)

topSuite : Test
topSuite =
    describe "top suite" []
`;

    await testFindTests(source, [
      {
        label: "top suite",
        file: testModuleUri,
        position: { line: 6, character: 4 },
        tests: [],
      },
    ]);
  });

  test("some", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Expect
import Test exposing (..)

topSuite : Test
topSuite =
    describe "top suite" 
    [ test "first" <| \_ -> Expect.equal True True
    , describe "nested"
        [ test "second" <| \_ -> Expect.equal False False
        ]
    ]
`;

    await testFindTests(source, [
      {
        label: "top suite",
        file: testModuleUri,
        position: { line: 7, character: 4 },
        tests: [
          {
            label: "first",
            file: testModuleUri,
            position: { line: 8, character: 6 },
          },
          {
            label: "nested",
            file: testModuleUri,
            position: { line: 9, character: 6 },
            tests: [
              {
                label: "second",
                file: testModuleUri,
                position: { line: 10, character: 10 },
              },
            ],
          },
        ],
      },
    ]);
  });

  test("ignore non Test top levels", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test exposing (..)

someThingElse = True

topSuite = describe "top suite" []
`;

    await testFindTests(source, [
      {
        label: "top suite",
        file: testModuleUri,
        position: { line: 6, character: 11 },
        tests: [],
      },
    ]);
  });

  test("with let/in", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test exposing (..)

topSuite : Test
topSuite =
    let
        foo =
            doit bar
    in
    let
        foo =
            doit bar
    in
    describe "top suite" [] 
`;

    await testFindTests(source, [
      {
        label: "top suite",
        file: testModuleUri,
        position: { line: 14, character: 4 },
        tests: [],
      },
    ]);
  });

  test("with deep let/in", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test exposing (..)

topSuite : Test
topSuite =
    describe "top suite"
        [ let
            a =
                doit 13
          in
          describe "deeper suite" []
        ]
`;

    await testFindTests(source, [
      {
        label: "top suite",
        file: testModuleUri,
        position: { line: 6, character: 4 },
        tests: [
          {
            label: "deeper suite",
            file: testModuleUri,
            position: { line: 11, character: 10 },
            tests: [],
          },
        ],
      },
    ]);
  });

  test("import without expose", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test

topSuite = Test.describe "top suite" []
`;

    await testFindTests(source, [
      {
        label: "top suite",
        file: testModuleUri,
        position: { line: 4, character: 11 },
        tests: [],
      },
    ]);
  });

  test("import with alias", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test as T 

topSuite = T.describe "top suite" []
`;

    await testFindTests(source, [
      {
        label: "top suite",
        file: testModuleUri,
        position: { line: 4, character: 11 },
        tests: [],
      },
    ]);
  });

  test("dynamic label is ignored", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test exposing (..)

topSuite = describe ("top suite" ++ "13") []
`;

    await testFindTests(source, []);
  });

  test("fuzz", async () => {
    const source = `
--@ tests/MyModule.elm 
module MyModule exposing (..)

import Expect
import Test exposing (..)
import Fuzz exposing (..)

top = fuzz int "top fuzz" <| \_ -> Expect.equal True True
`;

    await testFindTests(source, [
      {
        label: "top fuzz",
        file: testModuleUri,
        position: { line: 6, character: 6 },
      },
    ]);
  });

  // TODO improve inferred types?!
  test.skip("any test function", async () => {
    const source = `
--@ tests/MyModule.elm 
module MyModule exposing (..)

import Expect 
import Test exposing (..)

myTest : Int -> String -> Bool -> Test
myTest i desc b =
    describe desc []

top : Test
top = myTest 13 "my top" True  
`;

    await testFindTests(source, [
      {
        label: "top fuzz",
        file: testModuleUri,
        position: { line: 5, character: 6 },
      },
    ]);
  });
});
