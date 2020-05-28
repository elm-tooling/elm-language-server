import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

describe("typeVariableDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  it(`test return value to param`, async () => {
    const source = `
foo : a -> a
    --X  --^
foo a = a
`;
    await testBase.testDefinition(source);
  });

  it(`test param to param`, async () => {
    const source = `
foo : a -> b -> a -> ()
    --X       --^
foo _ _ _ = ()
`;
    await testBase.testDefinition(source);
  });

  it(`test function param to top level param`, async () => {
    const source = `
foo : a -> (a -> a) -> ()
    --X        --^
foo _ _ = ()
`;
    await testBase.testDefinition(source);
  });

  it(`test record field to top level param`, async () => {
    const source = `
foo : a -> { f : a } -> ()
    --X        --^
foo _ _ = ()
`;
    await testBase.testDefinition(source);
  });

  it(`test nested annotation return value to param`, async () => {
    const source = `
foo : a -> ()
foo _ =
    let
        bar : b -> b
            --X  --^
        bar b = b
    in
        ()
`;
    await testBase.testDefinition(source);
  });

  it(`test nested annotation param to outer param 1`, async () => {
    const source = `
foo : a -> ()
    --X
foo _ =
    let
        bar : a -> a -> ()
            --^
        bar b = b
    in
        ()
`;
    await testBase.testDefinition(source);
  });

  it(`test nested annotation param to outer param 2`, async () => {
    const source = `
foo : a -> ()
    --X
foo _ =
    let
        bar : a -> a -> ()
                 --^
        bar b = b
    in
        ()
`;
    await testBase.testDefinition(source);
  });

  it(`test nested record field to outer param`, async () => {
    const source = `
foo : b -> a -> ()
         --X
foo _ =
    let
        bar : a -> { f : { g : a } }
                             --^
        bar b = b
    in
        ()
`;
    await testBase.testDefinition(source);
  });
});
