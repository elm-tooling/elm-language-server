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
  });

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
  });

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

    await testCodeAction(source, [{ title: `Expose Type` }], expectedSource);
  });

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

    await testCodeAction(source, [{ title: `Unexpose Type` }], expectedSource);
  });

  test("exposing a type with all variants is available", async () => {
    const source = `
--@ Test.elm
module Test exposing (hello)

hello : string
hello =
    "hello"

type Hoge
   --^
    = Hello
    | World
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (hello, Hoge(..))

hello : string
hello =
    "hello"

type Hoge
    = Hello
    | World
`;

    await testCodeAction(
      source,
      [{ title: `Expose Type with Variants` }],
      expectedSource,
    );
  });

  test("exposing a type works even if another type is exposed that starts with the same", async () => {
    const source = `
--@ Test.elm
module Test exposing (hello, World2)

hello : string
hello =
    "hello"

type World2 = 
    World2

type World =
   --^
    World
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (hello, World2, World)

hello : string
hello =
    "hello"

type World2 = 
    World2

type World =
    World
`;

    await testCodeAction(source, [{ title: `Expose Type` }], expectedSource);
  });

  test("unexposing a type with all variants is available", async () => {
    const source = `
--@ Test.elm
module Test exposing (hello, Hoge(..))

hello : string
hello =
    "hello"

type Hoge
    --^
    = Hello
    | World
    `;

    const expectedSource = `
--@ Test.elm
module Test exposing (hello)

hello : string
hello =
    "hello"

type Hoge
    = Hello
    | World
    `;

    await testCodeAction(source, [{ title: `Unexpose Type` }], expectedSource);
  });
});
