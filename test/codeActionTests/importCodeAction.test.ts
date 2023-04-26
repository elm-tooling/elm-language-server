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

  test("add import alias of qualified value", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = Foo.foo
          --^

--@ App/Foo.elm
module App.Foo exposing (foo)

foo = ""
`;
    await testCodeAction(source, [
      { title: `Import module "App.Foo" as "Foo"` },
    ]);

    const source2 = `
--@ Test.elm
module Test exposing (..)

func = Bar.foo
      --^

--@ App/Foo/Bar.elm
module App.Foo.Bar exposing (foo)

foo = ""
`;
    await testCodeAction(source2, [
      { title: `Import module "App.Foo.Bar" as "Bar"` },
    ]);

    const source3 = `
--@ Test.elm
module Test exposing (..)

func = Foo.foo
      --^

--@ App/Foo/Bar.elm
module App.Foo.Bar exposing (foo)

foo = ""
    `;
    await testCodeAction(source3, []);
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

  test("add import of port", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func = foo
      --^

--@ App.elm
port module App exposing (foo)

port foo : String -> Cmd msg
`;
    await testCodeAction(source, [{ title: `Import 'foo' from module "App"` }]);
  });
});
