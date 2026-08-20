import { DefinitionProviderTestBase } from "./definitionProviderTestBase.js";

describe("miscDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  it(`test top-level value ref`, async () => {
    const source = `
magicNumber = 42
--X
f = magicNumber + 1
    --^
`;
    await testBase.testDefinition(source);
  });

  // LET-IN EXPRESSIONS

  it(`test simple value declared by let-in`, async () => {
    const source = `
f x =
    let
        y = 42
      --X
    in
       x + y
         --^
`;
    await testBase.testDefinition(source);
  });

  it(`test let-in should honor lexical scope in body expr`, async () => {
    const source = `
foo =
    let
        bar y = 0
    in y
     --^unresolved
`;
    await testBase.testDefinition(source);
  });

  it(`test let-in should honor lexical scope in sibling decl`, async () => {
    const source = `
foo =
    let
        bar y = 0
        quux = y
             --^unresolved
    in
        quux
`;
    await testBase.testDefinition(source);
  });

  // LAMBDAS (ANONYMOUS FUNCTIONS)

  it(`test lambda parameter ref`, async () => {
    const source = `
f = \\x -> x
   --X  --^
`;
    await testBase.testDefinition(source);
  });

  it(`test lambda parameter nested`, async () => {
    const source = `
f = \\x -> (\\() -> x)
   --X          --^
`;
    await testBase.testDefinition(source);
  });

  it(`test lambda parameter nested and should not resolve`, async () => {
    const source = `
f = \\() -> x (\\x -> ())
         --^unresolved
`;
    await testBase.testDefinition(source);
  });

  it(`test lambda parameter destructured record field ref`, async () => {
    const source = `
f = \\{x} -> x
    --X   --^
`;
    await testBase.testDefinition(source);
  });

  it(`test lambda parameter destructured tuple ref`, async () => {
    const source = `
f = \\(x,y) -> x
    --X     --^
`;
    await testBase.testDefinition(source);
  });

  it(`test lambda parameter destructured with alias`, async () => {
    const source = `
f = \\((x,y) as point) -> point
               --X       --^
`;
    await testBase.testDefinition(source);
  });

  // PORTS

  it(`test port ref`, async () => {
    const source = `
port module Ports exposing (..)
port foo : String -> Cmd msg
--X
update msg model = (model, foo "blah")
                           --^
`;
    await testBase.testDefinition(source);
  });
});
