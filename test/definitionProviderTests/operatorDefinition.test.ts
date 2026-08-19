import { DefinitionProviderTestBase } from "./definitionProviderTestBase.js";

describe("operatorDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  xit(`test basic usage`, async () => {
    const source = `
power a b = List.product (List.repeat b a)
infix right 5 (**) = power
              --X
f = 2 ** 3
    --^
`;
    await testBase.testDefinition(source);
  });

  it(`test ref from operator to implementation`, async () => {
    const source = `
infix right 5 (**) = power
                     --^
power a b = 42
--X
`;
    await testBase.testDefinition(source);
  });

  xit(`test operator as function`, async () => {
    const source = `
infix right 5 (**) = power
              --X
f = (**) 2 3
    --^
`;
    await testBase.testDefinition(source);
  });

  xit(`test exposed by module`, async () => {
    const source = `
module Foo exposing ((**))
                     --^
infix right 5 (**) = power
              --X
power a b = 42
`;
    await testBase.testDefinition(source);
  });
});
