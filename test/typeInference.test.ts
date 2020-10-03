import { URI } from "vscode-uri";
import { TreeUtils } from "../src/util/treeUtils";
import { findType } from "../src/util/types/typeInference";
import { TypeRenderer } from "../src/util/types/typeRenderer";
import { baseUri } from "./utils/mockElmWorkspace";
import { getTargetPositionFromSource } from "./utils/sourceParser";
import { SourceTreeParser } from "./utils/sourceTreeParser";

const basicsSources = `
--@ Basics.elm
module Basics exposing ((+), (|>), (==), Int, Float, Bool(..))

infix left  0 (|>) = apR
infix non   4 (==) = eq
infix left  6 (+)  = add

type Int = Int

type Float = Float

type Bool = True | False

add : number -> number -> number
add =
  Elm.Kernel.Basics.add

apR : a -> (a -> b) -> b
apR x f =
  f x

eq : a -> a -> Bool
eq =
  Elm.Kernel.Utils.equal
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

    expect(
      TypeRenderer.typeToString(
        nodeType,
        tree,
        testUri,
        workspace.getImports(),
      ),
    ).toEqual(expectedType);
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
      "number -> { a | first : { b | second : number } } -> Maybe number -> number",
    );
  });

  test("function with imported types", async () => {
    const source = `
--@ App.elm
module App exposing (..)

type Maybe a = Just a | Nothing 

plus : number -> number -> number
plus a b = a + b

--@ Test.elm
module Test exposing (..)

import App exposing (..)

func a b c =
--^
  let
    result = a + 1

  in
    (plus result b.first.second) +
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
      "number -> { a | first : { b | second : number } } -> Maybe number -> number",
    );
  });

  test("simple function with imported types", async () => {
    const source = `
--@ App.elm
module App exposing (..)

plus a b = a + b

--@ Test.elm
module Test exposing (..)

import App exposing (..)

func a b =
--^
  plus a b
`;
    await testTypeInference(
      basicsSources + source,
      "number -> number -> number",
    );
  });

  test("functions with records", async () => {
    const source = `
--@ App.elm
module App exposing (..)

type alias Model = {
  field : Int
}

access : Model -> Int
access model =
  model.field


--@ Test.elm
module Test exposing (..)

import App

func model =
--^
  App.access model
`;
    await testTypeInference(basicsSources + source, "App.Model -> Int");

    const source2 = `
--@ App.elm
module App exposing (..)

type alias Model = {
  field : Int
}

access : Model -> Int
access model =
  model.field

--@ Test.elm
module Test exposing (..)

import App exposing (..)

func model =
--^
  access model
`;
    await testTypeInference(basicsSources + source2, "Model -> Int");
  });

  test("field accessor function", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func model =
--^
  model |> .field |> (+) 1
`;
    await testTypeInference(
      basicsSources + source,
      "{ a | field : number } -> number",
    );
  });

  test("union constructor inference", async () => {
    const source = `
    --@ App.elm
module App exposing (Result(..))

type Result = Result { field : Int }

--@ Test.elm
module Test exposing (..)

import App exposing (Result(..))

func model =
--^
  model |> .field |> Result
`;
    await testTypeInference(
      basicsSources + source,
      "{ a | field : { field : Int } } -> Result",
    );

    const source2 = `
    --@ App.elm
module App exposing (..)

type Result = Result { field : Int }

--@ Test.elm
module Test exposing (..)

import App

func model =
--^
  model |> .field |> App.Result
`;
    await testTypeInference(
      basicsSources + source2,
      "{ a | field : { field : Int } } -> App.Result",
    );

    const source3 = `
    --@ App.elm
module App exposing (Result(..), toResult)

type Result = Result { field : Int }

toResult : Int -> Result
toResult a =
  Result { field = a }

--@ Test.elm
module Test exposing (..)

import App

func model =
--^
  model |> .field |> App.toResult
`;
    await testTypeInference(
      basicsSources + source3,
      "{ a | field : Int } -> App.Result",
    );
  });
});
