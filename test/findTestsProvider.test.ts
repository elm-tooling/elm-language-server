import { getSourceFiles } from "./utils/sourceParser.js";
import { SourceTreeParser, testsUri } from "./utils/sourceTreeParser.js";
import { URI } from "vscode-uri";
import {
  findAllTestSuites,
  stringLiteralToLabel,
} from "../src/providers/findTestsProvider.js";
import { TestSuite } from "../src/protocol.js";

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

  const testModuleUri = URI.file(testsUri + "/MyModule.elm").toString();

  async function testFindTests(source: string, expected: TestSuite[]) {
    await treeParser.init();

    const sources = getSourceFiles(basicsSources + sourceTestModule + source);
    const program = await treeParser.getProgram(sources);

    const suites = findAllTestSuites(program);
    expect(suites).toEqual(expected);
  }

  const moduleSuite = (tests: TestSuite[]): TestSuite => {
    return {
      label: "MyModule",
      file: testModuleUri,
      position: { line: 0, character: 0 },
      tests,
    };
  };

  const aTest = (line: number, character: number): TestSuite => ({
    label: "a test",
    file: testModuleUri,
    position: { line, character },
  });

  test("simple", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test exposing (..)

topSuite : Test
topSuite =
    describe "top suite" [ test "a test" <| \_ -> Expect.equal False False ]
`;

    await testFindTests(source, [
      moduleSuite([
        {
          label: "top suite",
          file: testModuleUri,
          position: { line: 6, character: 4 },
          tests: [aTest(6, 27)],
        },
      ]),
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
      moduleSuite([
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
      ]),
    ]);
  });

  test("ignore non Test top levels", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test exposing (..)

someThingElse = True

topSuite = describe "top suite" [ test "a test" <| \_ -> Expect.equal False False ]
`;

    await testFindTests(source, [
      moduleSuite([
        {
          label: "top suite",
          file: testModuleUri,
          position: { line: 6, character: 11 },
          tests: [aTest(6, 34)],
        },
      ]),
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
    describe "top suite" [ test "a test" <| \_ -> Expect.equal False False ]
`;

    await testFindTests(source, [
      moduleSuite([
        {
          label: "top suite",
          file: testModuleUri,
          position: { line: 14, character: 4 },
          tests: [aTest(14, 27)],
        },
      ]),
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
          describe "deeper suite" [ test "a test" <| \_ -> Expect.equal False False ]
        ]
`;

    await testFindTests(source, [
      moduleSuite([
        {
          label: "top suite",
          file: testModuleUri,
          position: { line: 6, character: 4 },
          tests: [
            {
              label: "deeper suite",
              file: testModuleUri,
              position: { line: 11, character: 10 },
              tests: [aTest(11, 36)],
            },
          ],
        },
      ]),
    ]);
  });

  test("import without expose", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test

topSuite = Test.describe "top suite" [ Test.test "a test" <| \_ -> Expect.equal False False ]
`;

    await testFindTests(source, [
      moduleSuite([
        {
          label: "top suite",
          file: testModuleUri,
          position: { line: 4, character: 11 },
          tests: [aTest(4, 39)],
        },
      ]),
    ]);
  });

  test("import with alias", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test as T

topSuite = T.describe "top suite" [ T.test "a test" <| \_ -> Expect.equal False False ]
`;

    await testFindTests(source, [
      moduleSuite([
        {
          label: "top suite",
          file: testModuleUri,
          position: { line: 4, character: 11 },
          tests: [aTest(4, 36)],
        },
      ]),
    ]);
  });

  test("dynamic label is ignored", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test exposing (..)

topSuite = describe ("top suite" ++ "13") [ test "a test" <| \_ -> Expect.equal False False ]
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
      moduleSuite([
        {
          label: "top fuzz",
          file: testModuleUri,
          position: { line: 6, character: 6 },
        },
      ]),
    ]);
  });

  test("multiline label", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Test exposing (..)

topSuite = describe """top suite
over
"multiple"
lines
""" [ test "a test" <| \_ -> Expect.equal False False ]
`;

    await testFindTests(source, [
      moduleSuite([
        {
          label: 'top suite\nover\n"multiple"\nlines\n',
          file: testModuleUri,
          position: { line: 4, character: 11 },
          tests: [aTest(8, 6)],
        },
      ]),
    ]);
  });

  test("nested empty suites", async () => {
    const source = `
--@ tests/MyModule.elm
module MyModule exposing (..)

import Expect
import Test exposing (..)

topSuite : Test
topSuite =
    describe "top suite"
    [ describe "nested" []
    ]
`;

    await testFindTests(source, []);
  });
});

describe("string literal to label", () => {
  test("simple", () => {
    expect(stringLiteralToLabel('"a simple string"')).toEqual(
      "a simple string",
    );
  });
  test("escaped", () => {
    expect(stringLiteralToLabel('"a simple \\\\ \\n string"')).toEqual(
      "a simple \\ \n string",
    );
  });

  test("multiline", () => {
    expect(stringLiteralToLabel('"""a multi\nline\nstring"""')).toEqual(
      "a multi\nline\nstring",
    );
  });
});
