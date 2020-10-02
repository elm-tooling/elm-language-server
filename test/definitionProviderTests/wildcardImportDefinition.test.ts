import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

describe("wildcardImportDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  it(`test explicit import shadowing wildcard`, async () => {
    const source = `
--@ main.elm
import Foo exposing (..)
import Bar exposing (bar)
main = bar
       --^Bar.elm
--@ Foo.elm
module Foo exposing (..)
bar = 42
--@ Bar.elm
module Bar exposing (..)
bar = 99
--X
`;
    await testBase.testDefinition(source);
  });

  it(`test explicit import shadowing wildcard 2`, async () => {
    const source = `
--@ main.elm
import Bar exposing (..)
import Foo exposing (bar)
main = bar
       --^Foo.elm
--@ Foo.elm
module Foo exposing (..)
bar = 42
--X
--@ Bar.elm
module Bar exposing (..)
bar = 99
`;
    await testBase.testDefinition(source);
  });
});
