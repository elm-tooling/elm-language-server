import { testCodeAction } from "./codeActionTestBase";

describe("import code actions", () => {
  test("add import of value", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = foo
      --^

--@ App.elm
module App exposing (foo)

foo = ""
`;
    await testCodeAction(source, [{ title: `Import 'foo' from module "App"` }]);
  });

  test("add import of qualified value", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = App.foo
          --^

--@ App.elm
module App exposing (foo)

foo = ""
`;
    await testCodeAction(source, [{ title: `Import module "App"` }]);

    const source2 = `
--@ Test.elm
module Test exposing (..)

func = App.foo
      --^

--@ App.elm
module App exposing (foo)

foo = ""
`;
    await testCodeAction(source2, [{ title: `Import module "App"` }]);
  });

  test("add all missing imports", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = foo + bar
      --^

--@ App.elm
module App exposing (foo, bar)

foo = ""

bar = ""
`;
    await testCodeAction(source, [{ title: `Add all missing imports` }]);
  });
});
