import { ReferencesProviderTestBase } from "./referencesProviderTestBase.js";

describe("portReferences", () => {
  const testBase = new ReferencesProviderTestBase();

  it(`port references in other files`, async () => {
    const source = `

--@ Module.elm
port module Module exposing (foo)
                            --X
port foo : String -> Cmd msg
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

  it(`port references used with module prefix in other files`, async () => {
    const source = `

--@ Module.elm
port module Module exposing (foo)
                            --X
port foo : String -> Cmd msg
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

  it(`port references used with module alias prefix in other files`, async () => {
    const source = `

--@ Module.elm
port module Module exposing (foo)
                            --X
port foo : String -> Cmd msg
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

  it(`local calls to a port`, async () => {
    const source = `

--@ Module.elm
port module Module exposing (foo)
                            --X
port foo : String -> Cmd msg
    --^

bar = foo
     --X
`;
    await testBase.testReferences(source);
  });
});
