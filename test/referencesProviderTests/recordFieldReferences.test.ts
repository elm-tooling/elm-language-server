import { ReferencesProviderTestBase } from "./referencesProviderTestBase.js";

describe("recordFieldReferences", () => {
  const testBase = new ReferencesProviderTestBase();

  it(`deduplicates record references through diamond-shaped imports`, async () => {
    const source = `
--@ Module.elm
module Module exposing (Foo)

type alias Foo = { field : String }
                   --^

--@ Left.elm
module Left exposing (Left)

import Module exposing (Foo)

type alias Left =
    { foo : Foo }

--@ Right.elm
module Right exposing (Right)

import Module exposing (Foo)

type alias Right =
    { foo : Foo }

--@ Combined.elm
module Combined exposing (Combined, fields)

import Left exposing (Left)
import Right exposing (Right)

type alias Combined =
    { left : Left
    , right : Right
    }

fields : Combined -> ( String, String )
fields combined =
    ( combined.left.foo.field
                        --X
    , combined.right.foo.field
                         --X
    )
`;
    await testBase.testReferences(source);
  });

  it(`record used in the same module`, async () => {
    const source = `
--@ Module.elm
module Module exposing (foo)

type alias Foo = { field : String }
                   --^

foo : Foo -> String
foo arg  =
    arg.field
        --X

update : Foo -> Foo
update arg =
    { arg | field = "" }
            --X

test : Foo
test =
    { field = "" }
      --X

destructure : Foo -> String
destructure { field } =
              --X
    field
    --X
`;
    await testBase.testReferences(source);
  });

  it(`record used in another module`, async () => {
    const source = `
--@ Module.elm
module Module exposing (Foo)

type alias Foo = { field : String }
                   --^

foo : Foo -> String
foo arg  =
    arg.field
        --X

update : Foo -> Foo
update arg =
    { arg | field = "" }
            --X

test : Foo
test =
    { field = "" }
      --X

destructure : Foo -> String
destructure { field } =
              --X
    field
    --X

--@ Bar.elm
module Bar exposing (..)

import Module exposing (Foo)

foo : Foo -> String
foo arg  =
    arg.field
        --X

update : Foo -> Foo
update arg =
    { arg | field = "" }
            --X

test : Foo
test =
    { field = "" }
      --X

destructure : Foo -> String
destructure { field } =
              --X
    field
    --X

`;
    await testBase.testReferences(source);
  });

  it(`record used in another module indirectly`, async () => {
    const source = `
--@ Module.elm
module Module exposing (Foo)

type alias Foo = { field : String }
                   --^

foo : Foo -> String
foo arg  =
    arg.field
        --X

update : Foo -> Foo
update arg =
    { arg | field = "" }
            --X

test : Foo
test =
    { field = "" }
      --X

destructure : Foo -> String
destructure { field } =
              --X
    field
    --X

--@ Bar.elm
module Bar exposing (Bar)

import Module exposing (Foo)

type alias Bar = { foo : Foo }

foo : Foo -> String
foo arg  =
    arg.field
        --X

update : Foo -> Foo
update arg =
    { arg | field = "" }
            --X

test : Foo
test =
    { field = "" }
      --X

destructure : Foo -> String
destructure { field } =
              --X
    field
    --X

--@ Indirect.elm
module Indirect exposing (..)

import Bar exposing (Bar)

foo : Bar -> String
foo arg  =
    arg.foo.field
           --X

update : Bar -> Bar
update arg =
    let
      foo = arg.foo
    in
    { arg | foo = { foo | field = "" } }
                          --X

test : Bar
test =
    { foo = { field = "" } }
              --X

destructure : Bar -> String
destructure { foo } =
    let
      { field } = foo
        --X

    in
    field
    --X
`;
    await testBase.testReferences(source);
  });
});
