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
module Basics exposing ((<|), Int, Float, Bool(..), Order(..), negate)

infix left  0 (<|) = apL

type Int = Int

type Float = Float

type Bool = True | False

add : number -> number -> number
add =
  Elm.Kernel.Basics.add

apL : (a -> b) -> a -> b
apL f x =
  f x
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

  async function testFindTests(source: string, expected: TestSuite[]) {
    await treeParser.init();

    const sources = getSourceFiles(basicsSources + sourceTestModule + source);
    const testModuleUri = URI.file(baseUri + "MyModule.elm").toString();

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
      ? tops.map((top) =>
          findTestSuite(findTestFunctionCall(top, typeChecker), typeChecker),
        )
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
        tag: "suite",
        label: '"top suite"',
        tests: [],
      },
    ]);
  });

  test("first", async () => {
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
        tag: "suite",
        label: '"top suite"',
        tests: [
          { tag: "test", label: '"first"' },
          {
            tag: "suite",
            label: '"nested"',
            tests: [{ tag: "test", label: '"second"' }],
          },
        ],
      },
    ]);
  });
});
