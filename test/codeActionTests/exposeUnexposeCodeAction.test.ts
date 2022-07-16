import { testCodeAction } from "./codeActionTestBase";

describe("expose unexpose code actions", () => {
  test("exposing a function is available", async () => {
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

    const expectedSource = `
--@ Test.elm
module Test exposing (hello, world)

hello : String
hello =
    "hello"

world : String
world =
    "world"
`;

    await testCodeAction(
      source,
      [{ title: `Expose Function` }],
      expectedSource,
    );
  })

  test("unexposing a function is available", async () => {
    const source = `
--@ Test.elm
module Test exposing (hello, world)

hello : String
hello =
--^
    "hello"

world : String
world =
    "world"
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (world)

hello : String
hello =
    "hello"

world : String
world =
    "world"
`;

    await testCodeAction(
      source,
      [{ title: `Unexpose Function` }],
      expectedSource,
    );
  })

  test("exposing a type is available", async () => {
    const source = `
--@ Test.elm
module Test exposing (hello)

hello : string
hello =
    "hello"

type World =
   --^
    World
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (hello, World)

hello : string
hello =
    "hello"

type World =
    World
`;

    await testCodeAction(
      source,
      [{ title: `Expose Type` }],
      expectedSource,
    );
  })

  test("unexposing a type is available", async () => {
    const source = `
--@ Test.elm
module Test exposing (hello, World)

hello : string
hello =
    "hello"

type World =
   --^
    World
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (hello)

hello : string
hello =
    "hello"

type World =
    World
`;

    await testCodeAction(
      source,
      [{ title: `Unexpose Type` }],
      expectedSource,
    );
  })
})
