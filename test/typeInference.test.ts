import { SourceTreeParser } from "./utils/sourceTreeParser";
import { getTargetPositionFromSource } from "./utils/sourceParser";
import { baseUri } from "./utils/mockElmWorkspace";
import { URI } from "vscode-uri";
import { TreeUtils } from "../src/util/treeUtils";
import { findType, typeToString } from "../src/util/types/typeInference";

const basicsSources = `
--@ Basics.elm
module Basics exposing (add, (+), Int, Float, Bool(..))

infix left  6 (+)  = add

type Int = Int

type Float = Float

type Bool = True | False

add : number -> number -> number
add =
  Elm.Kernel.Basics.add

`;
describe("test type inference", () => {
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
    await testTypeInference(basicsSources + source, "number");
  });

  test("simple function with params", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

add a b = a + b

test c d = 1 + (add c d)
--^
`;

    await testTypeInference(
      basicsSources + source,
      "number -> number -> number",
    );
  });

  test("simple int", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = 0
--^
`;
    await testTypeInference(basicsSources + source, "number");
  });

  test("simple string", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = "bla"
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

  test("complex function", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type Maybe a = Just a | Nothing

add a b = a + b

func a b c =
--^
  let
    result = a + 1

  in
    (add result b.first.second) +
      (if a == 1 then
        0
      else
        1) +
      (case c of
        Just value ->
          value

        Nothing ->
          0)

`;
    await testTypeInference(
      basicsSources + source,
      "number -> { a | first : { a | second : number } } -> Maybe number -> number",
    );
  });
});
