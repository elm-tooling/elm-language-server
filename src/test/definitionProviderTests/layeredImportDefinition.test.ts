import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

describe("layeredImportDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  /**
   * Layered imports are imports where multiple modules are imported using the same alias.
   */

  it(`test layered import using first import`, async () => {
    const source = `

--@ main.elm
import Foo as F
import FooExtra as F
main = F.bar
         --^Foo.elm
--@ Foo.elm
module Foo exposing (..)
bar = 42
--@ FooExtra.elm
module FooExtra exposing (..)
quux = 99
`;
    await testBase.testDefinition(source);
  });

  it(`test layered import using second import`, async () => {
    const source = `
--@ main.elm
import Foo as F
import FooExtra as F
main = F.quux
         --^FooExtra.elm
--@ Foo.elm
module Foo exposing (..)
bar = 42
--@ FooExtra.elm
module FooExtra exposing (..)
quux = 99
`;
    await testBase.testDefinition(source);
  });
});
