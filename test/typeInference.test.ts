import { SyntaxNode } from "web-tree-sitter";

import { SourceTreeParser } from "./utils/sourceTreeParser";
import {
  getSourceFiles,
  getTargetPositionFromSource,
} from "./utils/sourceParser";
import { baseUri } from "./utils/mockElmWorkspace";
import { URI } from "vscode-uri";
import { TreeUtils } from "../src/util/treeUtils";
import { findType, typeToString } from "../src/util/types/typeInference";

const basicsSources = `
--@ Basics.elm
module Basics exposing (..)

infix left  6 (+)  = add

type Int = Int

type Float = Float

add : number -> number -> number
add =
  Elm.Kernel.Basics.add

`;
xdescribe("test type inference", () => {
  const treeParser = new SourceTreeParser();

  async function testTypeInference(source: string, expectedType: string) {
    await treeParser.init();

    const result = getTargetPositionFromSource(source);

    if (!result) {
      throw new Error("Getting source and target position failed");
    }

    const testUri = URI.file(baseUri + "Test.elm").toString();

    const workspace = treeParser.getWorkspace(result.sources);
    const tree = workspace.getForest().getByUri(testUri)?.tree;

    if (!tree) throw new Error("Getting tree failed");

    const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
      tree.rootNode,
      result.position,
    );

    const nodeType = findType(nodeAtPosition, testUri, workspace);

    expect(typeToString(nodeType)).toEqual(expectedType);
  }

  test("simple function", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = 5 + 6
--^
`;
    await testTypeInference(basicsSources + source, "Int");
  });

  test("simple function with params", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

add a b = a + b

test c d = 1 + (add c d)
--^
`;

    await testTypeInference(basicsSources + source, "Int -> Int -> Int");
  });

  test("simple int", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

  0
--^
`;
    await testTypeInference(basicsSources + source, "Int");
  });

  test("simple string", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

"bla"
  --^
  `;
    await testTypeInference(basicsSources + source, "String");
  });

  test("simple bool", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = True
--^
`;
    await testTypeInference(basicsSources + source, "Bool");
  });
});
