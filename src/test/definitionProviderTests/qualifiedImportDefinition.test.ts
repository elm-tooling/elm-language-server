import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

describe("qualifiedImportDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  it(`test qualified value ref`, async () => {
    const source = `
--@ main.elm
import Foo
main = Foo.bar
           --^Foo.elm
--@ Foo.elm
module Foo exposing (bar)
bar = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test qualified value ref with caret on the qualifier`, async () => {
    const source = `
--@ main.elm
import Foo
main = Foo.bar
      --^Foo.elm
--@ Foo.elm
module Foo exposing (bar)
bar = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test qualified union type ref`, async () => {
    const source = `
--@ main.elm
import App
type alias Model = App.Page
                       --^App.elm
--@ App.elm
module App exposing (Page)
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  xit(`test qualified union constructor ref`, async () => {
    const source = `
--@ main.elm
import App
defaultPage = App.Home
                  --^App.elm
--@ App.elm
module App exposing (Page(Home))
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  xit(`test qualified union constructor ref in pattern destructuring`, async () => {
    const source = `
--@ main.elm
import App
title page =
    case page of
        App.Home -> "home"
            --^App.elm
--@ App.elm
module App exposing (Page(Home))
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  it(`test qualified type alias ref`, async () => {
    const source = `
--@ main.elm
import App
type Entity = PersonEntity App.Person
                               --^App.elm
--@ App.elm
module App exposing (Person)
type alias Person = { name : String, age: Int }
`;
    await testBase.testDefinition(source);
  });

  it(`test qualified record constructor ref`, async () => {
    const source = `
--@ main.elm
import App
defaultPerson = App.Person "George" 42
                    --^App.elm
--@ App.elm
module App exposing (Person)
type alias Person = { name : String, age: Int }
`;
    await testBase.testDefinition(source);
  });

  xit(`test qualified port ref`, async () => {
    const source = `
--@ main.elm
import Ports
update msg model = (model, Ports.foo "blah")
                                 --^Ports.elm
--@ Ports.elm
port module Ports exposing (foo)
port foo : String -> Cmd msg
`;
    await testBase.testDefinition(source);
  });
});
