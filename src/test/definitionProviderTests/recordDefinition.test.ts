import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

describe("recordDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  it(`test field access ref`, async () => {
    const source = `
foo : { b : String }
foo a = a.b
  --X --^
`;
    await testBase.testDefinition(source);
  });

  it(`test record name base ref`, async () => {
    const source = `
foo a = { a | bar = a.bar }
  --X   --^
`;
    await testBase.testDefinition(source);
  });

  xit(`test record extension type base ref in type alias decl`, async () => {
    const source = `
type alias Foo a = { a | bar : Int }
             --X   --^
`;
    await testBase.testDefinition(source);
  });

  xit(`test record extension type base ref in union type decl`, async () => {
    const source = `
type Foo a = Bar { a | bar : Int }
       --X       --^
`;
    await testBase.testDefinition(source);
  });
});
