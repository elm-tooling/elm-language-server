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
--X
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
--X
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
--X
`;
    await testBase.testDefinition(source);
  });

  it(`test qualified union constructor ref`, async () => {
    const source = `
--@ main.elm
import App
defaultPage = App.Home
                  --^App.elm
--@ App.elm
module App exposing (Page(..))
type Page = Home
           --X
`;
    await testBase.testDefinition(source);
  });

  it(`test qualified union constructor ref in pattern destructuring`, async () => {
    const source = `
--@ main.elm
import App
title page =
    case page of
        App.Home -> "home"
            --^App.elm
--@ App.elm
module App exposing (Page(..))
type Page = Home
           --X
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
--X
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
--X
`;
    await testBase.testDefinition(source);
  });

  it(`test qualified port ref`, async () => {
    const source = `
--@ main.elm
import Ports
update msg model = (model, Ports.foo "blah")
                                 --^Ports.elm
--@ Ports.elm
port module Ports exposing (foo)
port foo : String -> Cmd msg
--X
`;
    await testBase.testDefinition(source);
  });

  it(`test union constructor should not resolve to type declaration from other file`, async () => {
    const source = `
--@ main.elm
import App

func: App.User
func =
    App.User { data = "" }
        --^App.elm

--@ App.elm
module App exposing (..)

type User = User { data : String }
           --X
`;
    await testBase.testDefinition(source);
  });

  it(`test type declaration should not resolve to union constructor from other file`, async () => {
    const source = `
--@ main.elm
import App

func: App.User
         --^App.elm
func =
    App.User { data = "" }

--@ App.elm
module App exposing (..)

type User = User { data : String }
--X
`;
    await testBase.testDefinition(source);
  });

  it(`test import of a value that ends in the same letter as the module`, async () => {
    const source = `
  --@ main.elm
import Svg

func =
    Svg.g
      --^Svg.elm

--@ Svg.elm
module Svg exposing (g)

g =
--<X
    ""
`;
    await testBase.testDefinition(source);
  });
});
