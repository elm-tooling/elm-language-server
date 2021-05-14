import { ReferencesProviderTestBase } from "./referencesProviderTestBase";

describe("functionReferences", () => {
  const testBase = new ReferencesProviderTestBase();

  it(`function references in other files`, async () => {
    const source = `
--@ Module.elm
module Module exposing (foo)
                       --X
foo = 42
--^

--@ Bar.elm
module Bar exposing (..)

import Module exposing (foo)
                       --X

bar = foo
     --X

--@ FooExtra.elm
module FooExtra exposing (..)

import Module exposing (foo)
                       --X

func = foo
      --X
`;
    await testBase.testReferences(source);
  });

  it(`function with args references in other files`, async () => {
    const source = `
--@ Module.elm
module Module exposing (foo)
                       --X
foo a b = 42
--^

--@ Bar.elm
module Bar exposing (..)

import Module exposing (foo)
                       --X

bar = foo 1 2
     --X

--@ FooExtra.elm
module FooExtra exposing (..)

import Module exposing (foo)
                       --X

func = foo 1 2
      --X
`;
    await testBase.testReferences(source);
  });

  it(`function references used with module prefix in other files`, async () => {
    const source = `
--@ Module.elm
module Module exposing (foo)
                       --X
foo = 42
--^

--@ Bar.elm
module Bar exposing (..)

import Module

bar = Module.foo
           --X

--@ FooExtra.elm
module FooExtra exposing (..)

import Module

func = Module.foo
             --X
`;
    await testBase.testReferences(source);
  });

  it(`function with arg references used with module prefix in other files`, async () => {
    const source = `
--@ Module.elm
module Module exposing (foo)
                       --X
foo a b = 42
--^

--@ Bar.elm
module Bar exposing (..)

import Module

bar = Module.foo 1 2
           --X

--@ FooExtra.elm
module FooExtra exposing (..)

import Module

func = Module.foo 1 2
             --X
`;
    await testBase.testReferences(source);
  });

  it(`function references used with module alias prefix in other files`, async () => {
    const source = `
--@ Module.elm
module Module exposing (foo)
                       --X
foo = 42
--^

--@ Bar.elm
module Bar exposing (..)

import Module as Mod

bar = Mod.foo
         --X

--@ FooExtra.elm
module FooExtra exposing (..)

import Module as Mod

func = Mod.foo
          --X
`;
    await testBase.testReferences(source);
  });

  it(`local calls to a function`, async () => {
    const source = `
--@ Module.elm
module Module exposing (foo)
                        --X
foo = 42
--^

bar = foo
     --X
`;
    await testBase.testReferences(source);
  });

  it(`local calls to a function with args`, async () => {
    const source = `
--@ Module.elm
module Module exposing (foo)
                        --X
foo a = 42
--^

bar = foo 1
     --X
`;
    await testBase.testReferences(source);
  });

  it(`function annotation gets a reference`, async () => {
    const source = `
--@ Module.elm
foo : Int
--X
foo = 42
--^
`;
    await testBase.testReferences(source);
  });

  it(`let function should not be referenced outside of let`, async () => {
    const source = `
--@ Module.elm
foo =
    let
        func = ""
       --^

        bar = func
              --X

        val = ""
    in
    ""

test = func
`;
    await testBase.testReferences(source);
  });

  it(`function should be referenced if used as a base record`, async () => {
    const source = `
--@ Module.elm
foo =
--^
    { field : String }

test =
    { foo | field = "" }
     --X
`;
    await testBase.testReferences(source);
  });

  it(`function should be referenced if used as a record accessor`, async () => {
    const source = `
--@ Module.elm
foo =
--^
    { field : String }

test =
    foo.field
   --X
`;
    await testBase.testReferences(source);
  });

  it(`function references used both with and without module prefix in other files`, async () => {
    const source = `
--@ Module.elm
module Module exposing (foo)
                       --X
foo = 42
--^

--@ Bar.elm
module Bar exposing (..)

import Module

bar = Module.foo
           --X

--@ FooExtra.elm
module FooExtra exposing (..)

import Module exposing (foo)
                       --X

func = Module.foo
             --X

func2 = foo
       --X
`;
    await testBase.testReferences(source);
  });
});
