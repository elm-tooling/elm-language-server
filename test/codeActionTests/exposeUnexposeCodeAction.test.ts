import { testCodeAction } from "./codeActionTestBase";

describe("expose unexpose code actions", () => {
  test("expose a function", async () => {
    const source = `
--@ Test.elm
module Test exposing (hello)

hello : String
hello =
    "hello"

world : String
world =
--^
    "world"
`;

    await testCodeAction(source, [{ title: `Expose Function` }]);
  })

  test("unexpose a function", async () => {
    const source = `
--@ Test.elm
module Test exposing (hello)

hello : String
hello =
--^
    "hello"
`;

    await testCodeAction(source, [{ title: `Unexpose Function` }]);
  })
})
