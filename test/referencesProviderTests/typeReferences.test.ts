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

  it(`type references in other files used with module prefix`, async () => {
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

  it(`import with same name is not a union constructor reference - issue #580`, async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Html

type Model = Html
            --^

value : Model
value = Html
       --X

view : Html.Html msg
view = Html.p [] []
`;
    await testBase.testReferences(source);
  });

  it(`check for correct reference count - issue #668`, async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


type A
   --^
    = A


type Aardvark
    = Aardvark

--@ Test2.elm

module Test2 exposing (..)

import Test exposing (Aardvark)


test =
    5


`;
    await testBase.testReferences(source);
  });

  // https://github.com/elm-tooling/elm-language-server/issues/972
  it(`type alias used as constructor`, async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias MyRecord =
            --^
    { score : Int
    }


decodeStuff : MyRecord
              --X
decodeStuff =
    MyRecord 0
    --X
`;
    await testBase.testReferences(source);
  });

  it(`type alias used as constructor in another file`, async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type alias MyRecord =
            --^
    { score : Int
    }


--@ Foo.elm
module Foo exposing (..)

import Test exposing (MyRecord)
                      --X

decodeStuff : MyRecord
              --X
decodeStuff =
    MyRecord 0
    --X
`;
    await testBase.testReferences(source);
  });

  it(`type used not used as constructor`, async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type MyRecord =
      --^
    MyRecord Int


decodeStuff : MyRecord
              --X
decodeStuff =
    MyRecord 0
`;
    await testBase.testReferences(source);
  });

  it(`type is not used as constructor in another file`, async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type MyRecord =
      --^
    MyRecord Int


--@ Foo.elm
module Foo exposing (..)

import Test exposing (MyRecord(..))
                      --X

decodeStuff : MyRecord
               --X
decodeStuff =
    MyRecord 0
`;
    await testBase.testReferences(source);
  });
});
