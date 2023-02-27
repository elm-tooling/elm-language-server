import { testCodeAction } from "./codeActionTestBase";

describe("add type annotation code action", () => {
  it("should annotate a type of functions", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

hello : String
hello =
    let
        value =
        --^
            "hello"
    in
    value
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

hello : String
hello =
    let
        value : String
        value =
            "hello"
    in
    value
`;

    await testCodeAction(
      source,
      [{ title: "Add inferred annotation" }],
      expectedSource,
    );
  })
})
