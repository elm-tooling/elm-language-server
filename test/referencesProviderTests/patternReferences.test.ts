import { ReferencesProviderTestBase } from "./referencesProviderTestBase";

describe("functionReferences", () => {
  const testBase = new ReferencesProviderTestBase();

  it(`let destructured patterns should have references`, async () => {
    const source = `
--@ Module.elm
module Module exposing (foo)
                       
foo =
    let
        ( first, second ) = func
          --^
    in
    case first of
         --X
        "" ->
            bar first
                --X

        _ ->
            ""
`;
    await testBase.testReferences(source);
  });
});
