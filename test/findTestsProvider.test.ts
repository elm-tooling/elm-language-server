import { getSourceFiles } from "./utils/sourceParser";
import { baseUri, SourceTreeParser } from "./utils/sourceTreeParser";
import { URI } from "vscode-uri";
import { TreeUtils } from "../src/util/treeUtils";
import {
  findTestFunctionCall,
  findTestSuite,
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
module Test exposing (Test(..), describe, test)

import Expect exposing (..)
import Test.Internal as Internal

type alias Test = Internal.Test

describe : String -> List Test -> Test
describe untrimmedDesc tests = T

test : String -> (() -> Expectation) -> Test
test untrimmedDesc thunk = T

--@ Expect.elm
module Expect exposing (Expectation(..), equal)

type Expectation = E

equal : a -> a -> Expectation
equal aa bb = E
`;

describe("FindTestsProvider", () => {
  const treeParser = new SourceTreeParser();
  const testModuleUri = URI.file(baseUri + "MyModule.elm").toString();

  async function testFindTests(source: string, expected: TestSuite[]) {
    await treeParser.init();

    const sources = getSourceFiles(basicsSources + sourceTestModule + source);

    const program = await treeParser.getProgram(sources);
    const sourceFile = program.getSourceFile(testModuleUri);
    expect(sourceFile).not.toBeUndefined;
    if (!sourceFile) {
      throw new Error("parsing failed");
    }
    expect(sourceFile.isTestFile).toBeTruthy;

    const tops = TreeUtils.findAllTopLevelFunctionDeclarations(sourceFile.tree);

    const typeChecker = program.getTypeChecker();

    const suites = tops
      ? tops
          .map((top) =>
            findTestSuite(
              findTestFunctionCall(top, typeChecker),
              sourceFile,
              typeChecker,
            ),
          )
          .reduce((acc, s) => (s ? [...acc, s] : acc), [])
      : [];
    expect(suites).toEqual(expected);
  }

  test("empty", async () => {
    const source = `
--@ MyModule.elm
module MyModule exposing (..)

import Expect
import Test exposing (..)

topSuite : Test
topSuite =
    describe "top suite" []
`;

    await testFindTests(source, [
      {
        label: '"top suite"',
        file: testModuleUri,
        position: { line: 7, character: 4 },
        tests: [],
      },
    ]);
  });

  test("some", async () => {
    const source = `
--@ MyModule.elm
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
        label: '"top suite"',
        file: testModuleUri,
        position: { line: 7, character: 4 },
        tests: [
          {
            label: '"first"',
            file: testModuleUri,
            position: { line: 8, character: 6 },
          },
          {
            label: '"nested"',
            file: testModuleUri,
            position: { line: 9, character: 6 },
            tests: [
              {
                label: '"second"',
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
--@ MyModule.elm
module MyModule exposing (..)

import Test exposing (..)

someThingElse = True

topSuite = describe "top suite" []
`;

    await testFindTests(source, [
      {
        label: '"top suite"',
        file: testModuleUri,
        position: { line: 6, character: 11 },
        tests: [],
      },
    ]);
  });

  test("import without expose", async () => {
    const source = `
--@ MyModule.elm
module MyModule exposing (..)

import Test

topSuite = Test.describe "top suite" []
`;

    await testFindTests(source, [
      {
        label: '"top suite"',
        file: testModuleUri,
        position: { line: 4, character: 11 },
        tests: [],
      },
    ]);
  });

  test("import with alias", async () => {
    const source = `
--@ MyModule.elm
module MyModule exposing (..)

import Test as T 

topSuite = T.describe "top suite" []
`;

    await testFindTests(source, [
      {
        label: '"top suite"',
        file: testModuleUri,
        position: { line: 4, character: 11 },
        tests: [],
      },
    ]);
  });

  test("dynamic label", async () => {
    const source = `
--@ MyModule.elm
module MyModule exposing (..)

import Test exposing (..)

topSuite = describe ("top suite" ++ "13") []
`;

    await testFindTests(source, [
      {
        label: ['"top suite"', '"13"'],
        file: testModuleUri,
        position: { line: 4, character: 11 },
        tests: [],
      },
    ]);
  });
});
