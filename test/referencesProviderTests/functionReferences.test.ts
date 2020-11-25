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
});
