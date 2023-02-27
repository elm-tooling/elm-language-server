import { ReferencesProviderTestBase } from "./referencesProviderTestBase";

describe("typeVariableReferences", () => {
  const testBase = new ReferencesProviderTestBase();

  it(`simple type annotation type variable reference`, async () => {
    const source = `
--@ Module.elm
module Module exposing (..)

foo : Model a -> a
          --^  --X
foo = 42
`;
    await testBase.testReferences(source);
  });

  it(`nested type annotation type variable reference`, async () => {
    const source = `
--@ Module.elm
module Module exposing (..)

foo : Model a -> a
          --^  --X
foo = 
    let
        func : a -> Model a
             --X        --X
        func =
            32

    in
    42
`;
    await testBase.testReferences(source);
  });

  it(`type alias type variable reference`, async () => {
    const source = `
--@ Module.elm
module Module exposing (..)

type alias Foo a b =
             --^
    { bar : a
          --X
    , baz : b
    }
`;
    await testBase.testReferences(source);
  });

  it(`type declaration type variable reference`, async () => {
    const source = `
--@ Module.elm
module Module exposing (..)

type Maybe a
         --^
    = Just a
         --X
    | Nothing
`;
    await testBase.testReferences(source);
  });
});
