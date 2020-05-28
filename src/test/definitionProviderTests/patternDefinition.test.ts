import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

describe("patternDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  // CASE-OF EXPRESSIONS AND PATTERNS

  it(`test case-of pattern wildcard`, async () => {
    const source = `
f x =
    case x of
        0 -> 0
        y -> 2 * y
      --X      --^
`;
    await testBase.testDefinition(source);
  });

  it(`test case-of pattern union type constructor`, async () => {
    const source = `
f x =
    case x of
        Nothing -> 0
        Just something -> something
             --X          --^
`;
    await testBase.testDefinition(source);
  });

  it(`test case-of pattern union type constructor with constructor parameter`, async () => {
    const source = `
type Foo = Foo
           --X
f x =
    case x of
        Nothing -> 0
        Just Foo -> 1
             --^
`;
    await testBase.testDefinition(source);
  });

  it(`test case-of that should not resolve`, async () => {
    const source = `
f x =
    case () of
        Just foo -> ()
        _ -> foo
             --^unresolved
`;
    await testBase.testDefinition(source);
  });

  it(`test nested case-of`, async () => {
    const source = `
f x =
    case () of
        _ ->
            case () of
                _ -> ()
                Just foo -> foo
                     --X    --^
`;
    await testBase.testDefinition(source);
  });

  // see bug https://github.com/klazuka/intellij-elm/issues/106
  it(`test nested case-of that should not resolve`, async () => {
    const source = `
f x =
    case () of
        _ ->
            case () of
                Just foo -> ()
                _ -> foo
                     --^unresolved
`;
    await testBase.testDefinition(source);
  });

  // PARAMETER DESTRUCTURING

  it(`test function parameter record destructuring`, async () => {
    const source = `
foo { name } = name
      --X      --^
`;
    await testBase.testDefinition(source);
  });

  it(`test function parameter tuple destructuring`, async () => {
    const source = `
foo ( x, y ) = x + y
       --X       --^
`;
    await testBase.testDefinition(source);
  });

  // TODO [drop 0.18] this becomes invalid at the top-level in 0.19
  it(`test top-level value destructuring`, async () => {
    const source = `
( x, y ) = (0, 0)
   --X
f = y + 20
  --^
`;
    await testBase.testDefinition(source);
  });

  it(`test nested function parameter destructuring`, async () => {
    const source = `
f =
    let
        g ( x, y ) = x + y
             --X       --^
    in
        g (320, 480)
`;
    await testBase.testDefinition(source);
  });

  // PATTERN ALIASES

  it(`test pattern alias in function decl parameter`, async () => {
    const source = `
foo ((x, y) as point) = point
               --X      --^
`;
    await testBase.testDefinition(source);
  });

  it(`test pattern alias in function parameter in let-in expr`, async () => {
    const source = `
f =
    let
        g ((x, y) as point) = point
                     --X      --^
    in
        g (320, 480)
`;
    await testBase.testDefinition(source);
  });

  it(`test pattern alias in let-in destructuring assignment`, async () => {
    const source = `
f =
    let
        ((x, y) as point) = (320, 480)
                   --X
    in
        point
        --^
`;
    await testBase.testDefinition(source);
  });

  it(`test pattern alias in case-of branch`, async () => {
    const source = `
f x =
    case x of
        ((x, y) as point) -> point
                   --X       --^
`;
    await testBase.testDefinition(source);
  });
});
