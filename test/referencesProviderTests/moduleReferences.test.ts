import { ReferencesProviderTestBase } from "./referencesProviderTestBase.js";

describe("moduleReferences", () => {
  const testBase = new ReferencesProviderTestBase();

  it(`module references in other files`, async () => {
    const source = `

--@ Module.elm
module Module exposing (foo)
        --^
foo = 42

--@ Bar.elm
module Bar exposing (..)

import Module exposing (foo)
       --X

bar = foo

--@ FooExtra.elm
module FooExtra exposing (..)

import Module
       --X

func = Module.foo
       --X
`;
    await testBase.testReferences(source);
  });

  it(`module references in other files used with alias`, async () => {
    const source = `

--@ Module/Foo.elm
module Module.Foo exposing (foo)
        --^
foo = 42

--@ Bar.elm
module Bar exposing (..)

import Module.Foo as Foo exposing (foo)
        --X

bar = foo

--@ FooExtra.elm
module FooExtra exposing (..)

import Module.Foo as Foo
        --X

func = Foo.foo
`;
    await testBase.testReferences(source);
  });
});
