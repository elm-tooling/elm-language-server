import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

describe("functionDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  it(`test function name ref`, async () => {
    const source = `
addOne x = x + 1
--X
f = addOne 42
    --^
`;
    await testBase.testDefinition(source);
  });

  it(`test function parameter ref`, async () => {
    const source = `
foo x y =  x + y
    --X      --^
`;
    await testBase.testDefinition(source);
  });

  it(`test type annotation refers to function name decl`, async () => {
    const source = `
addOne : Int -> Int
--^
addOne x = x + 1
--X
`;
    await testBase.testDefinition(source);
  });

  it(`test nested function parameter ref`, async () => {
    const source = `
f x =
    let scale y = 100 * y
            --X       --^
    in x
`;
    await testBase.testDefinition(source);
  });

  it(`test deep lexical scope of function parameters`, async () => {
    const source = `
f x =
--X
    let
        y =
            let
                z = x + 1
                  --^
            in z
    in y
`;
    await testBase.testDefinition(source);
  });

  it(`test recursive function ref`, async () => {
    const source = `
foo x =
--X
    if x <= 0 then 0 else foo (x - 1)
                          --^
`;
    await testBase.testDefinition(source);
  });

  it(`test nested recursive function ref`, async () => {
    const source = `
foo =
    let
        bar y = if y <= 0 then 0 else bar (y - 1)
        --X                           --^
    in bar 100
`;
    await testBase.testDefinition(source);
  });

  it(`test unresolved ref to function`, async () => {
    const source = `
f x = g x
    --^unresolved
`;
    await testBase.testDefinition(source);
  });

  it(`test unresolved ref to function parameter`, async () => {
    const source = `
f x = x
g y = x
    --^unresolved
`;
    await testBase.testDefinition(source);
  });

  it(`test type annotation name ref`, async () => {
    const source = `
foo : Int -> Int
--^
foo a = a
--X
outer =
    let
        foo a = a
    in foo
`;
    await testBase.testDefinition(source);
  });
});
