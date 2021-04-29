import { getSourceFiles } from "./utils/sourceParser";
import { baseUri, SourceTreeParser } from "./utils/sourceTreeParser";
import { URI } from "vscode-uri";
import { TreeUtils } from "../src/util/treeUtils";
import {
  findTestFunctionCall,
  findTestSuite,
  TestSuite,
} from "../src/providers/findTestsProvider";

const source = `
--@ TestModule.elm
module TestModule exposing (..)

import Expect
import Test exposing (..)

topSuite : Test
topSuite =
    describe "top suite"
        [ test "first" <| \_ -> Expect.equal 13 13
        , describe "nested"
            [ test "second" <| \_ -> Expect.equal 14 14
            ]
        ]
`;

describe("FindTestsProvider", () => {
  const treeParser = new SourceTreeParser();

  async function testFindTests(source: string, expected: TestSuite[]) {
    await treeParser.init();

    const sources = getSourceFiles(source);
    const testModuleUri = URI.file(baseUri + "TestModule.elm").toString();

    const program = await treeParser.getProgram(sources);
    const sourceFile = program.getSourceFile(testModuleUri);
    expect(sourceFile).not.toBeUndefined;
    if (!sourceFile) {
      throw new Error("parsing failed");
    }
    expect(sourceFile.isTestFile).toBeTruthy;

    const tops = TreeUtils.findAllTopLevelFunctionDeclarations(sourceFile.tree);

    const suites = tops
      ? tops.map((top) => findTestSuite(findTestFunctionCall(top)))
      : [];
    expect(suites).toEqual(expected);
  }

  test("first", async () => {
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
