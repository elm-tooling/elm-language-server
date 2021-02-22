import { ReferencesProviderTestBase } from "./referencesProviderTestBase";

describe("type references", () => {
  const testBase = new ReferencesProviderTestBase();

  it(`type references in other files`, async () => {
    const source = `
--@ Module.elm
module Module exposing (MyType(..))
                        --X
type MyType = A | B
     --^

--@ Bar.elm
module Bar exposing (..)

import Module exposing (MyType(..))
                        --X
bar : MyType
      --X
bar = A

--@ FooExtra.elm
module FooExtra exposing (..)

import Module exposing (MyType(..))
                        --X
func : String -> MyType
                 --X
func a = B
`;
    await testBase.testReferences(source);
  });

  xit(`type references in other files used with module prefix`, async () => {
    const source = `
--@ Module.elm
module Module exposing (MyType(..))
                        --X
type MyType = A | B
     --^

--@ Bar.elm
module Bar exposing (..)

import Module 

bar : Module.MyType
             --X
bar = A

--@ FooExtra.elm
module FooExtra exposing (..)

import Module as M

func : String -> M.MyType
                   --X
func a = B
`;
    await testBase.testReferences(source);
  });

  it(`union constructor references in other files`, async () => {
    const source = `
--@ Module.elm
module Module exposing (MyType(..))

type MyType = A | B
            --^

--@ Bar.elm
module Bar exposing (..)

import Module exposing (MyType(..))

bar : MyType
bar = A
    --X

--@ FooExtra.elm
module FooExtra exposing (..)

import Module exposing (MyType(..))

func : MyType -> String
func a = 
    case a of
        B ->
          ""

        A ->
      --X
          ""
`;
    await testBase.testReferences(source);
  });

  it(`union constructor references in other files using module prefix`, async () => {
    const source = `
--@ Module.elm
module Module exposing (MyType(..))

type MyType = A | B
            --^

--@ Bar.elm
module Bar exposing (..)

import Module

bar : MyType
bar = Module.A
        --X

--@ FooExtra.elm
module FooExtra exposing (..)

import Module as M

func : MyType -> String
func a = 
    case a of
        M.B ->
          ""

        M.A ->
      --X
          ""
`;
    await testBase.testReferences(source);
  });
});
