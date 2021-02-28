import { testCodeAction } from "./codeActionTestBase";

describe("swap list item code action", () => {
  it("should swap item aa with bb", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ "aa", "bb", "cc" ]
    --^

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ "bb", "aa", "cc" ]

`;

    await testCodeAction(
      source,
      [{ title: "Move List item Down" }],
      expectedSource,
    );
  });
})
