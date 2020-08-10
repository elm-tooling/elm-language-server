import { container } from "tsyringe";
import { Forest } from "../../src/forest";
import { DefinitionProviderTestBase } from "./definitionProviderTestBase";

afterEach(() => {
  container.registerSingleton("Forest", Forest);
});

describe("importDefinition", () => {
  const testBase = new DefinitionProviderTestBase();

  it(`test value ref in import declaration`, async () => {
    const source = `
--@ main.elm
import Foo exposing (bar)
                     --^Foo.elm
--@ Foo.elm
module Foo exposing (bar)
bar = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test value ref from expression`, async () => {
    const source = `
--@ main.elm
import Foo exposing (bar)
main = bar
       --^Foo.elm
--@ Foo.elm
module Foo exposing (bar)
bar = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test value ref from expression but not exposed by import`, async () => {
    const source = `
--@ main.elm
import Foo
main = bar
       --^unresolved
--@ Foo.elm
module Foo exposing (bar)
bar = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test value ref from expression but not exposed by module`, async () => {
    const source = `
--@ main.elm
import Foo exposing (bar)
main = bar
       --^unresolved
--@ Foo.elm
module Foo exposing ()
bar = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test import of hierarchical module`, async () => {
    const source = `
--@ main.elm
import Foo.Bar exposing (bar)
                         --^Foo/Bar.elm
--@ Foo/Bar.elm
module Foo.Bar exposing (bar)
bar = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test value import exposing all`, async () => {
    const source = `
--@ main.elm
import Foo exposing (..)
f = bar
   --^Foo.elm
--@ Foo.elm
module Foo exposing (bar)
bar = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test value import exposing all from both sides`, async () => {
    const source = `
--@ main.elm
import Foo exposing (..)
f = bar
   --^Foo.elm
--@ Foo.elm
module Foo exposing (..)
bar = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test value import exposing all but not exposed by module`, async () => {
    const source = `
--@ main.elm
import Foo exposing (..)
f = bar
   --^unresolved
--@ Foo.elm
module Foo exposing ()
bar = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test union type ref in import declaration`, async () => {
    const source = `
--@ main.elm
import App exposing (Page)
                     --^App.elm
--@ App.elm
module App exposing (Page)
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  it(`test union type ref in type definition`, async () => {
    const source = `
--@ main.elm
import App exposing (Page)
type alias Model = Page
                   --^App.elm
--@ App.elm
module App exposing (Page)
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  it(`test union type ref in body but not exposed by import`, async () => {
    const source = `
--@ main.elm
import App
type alias Model = Page
                   --^unresolved
--@ App.elm
module App exposing (Page)
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  it(`test union type ref in body but not exposed by module`, async () => {
    const source = `
--@ main.elm
import App exposing (Page)
type alias Model = Page
                   --^unresolved
--@ App.elm
module App exposing ()
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  xit(`test union constructor ref in import exposing list`, async () => {
    const source = `
--@ main.elm
import App exposing (Page(Home))
                          --^App.elm
--@ App.elm
module App exposing (Page(Home))
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  xit(`test union constructor ref in expression`, async () => {
    const source = `
--@ main.elm
import App exposing (Page(Home))
defaultPage = Home
              --^App.elm
--@ App.elm
module App exposing (Page(Home))
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  xit(`test union constructor ref in expression via import exposing all constructors`, async () => {
    const source = `
--@ main.elm
import App exposing (Page(..))
defaultPage = Home
              --^App.elm
--@ App.elm
module App exposing (Page(Home))
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  it(`test union constructor ref in expression via module exposing all constructors`, async () => {
    const source = `
--@ main.elm
import App exposing (Page(Home))
defaultPage = Home
              --^App.elm
--@ App.elm
module App exposing (Page(..))
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  xit(`test union constructor ref in expression exposing all from both sides`, async () => {
    const source = `
--@ main.elm
import App exposing (..)
defaultPage = Home
              --^App.elm
--@ App.elm
module App exposing (..)
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  it(`test union constructor ref in expression but not exposed by module`, async () => {
    const source = `
--@ main.elm
import App exposing (Page(Home))
defaultPage = Home
              --^unresolved
--@ App.elm
module App exposing (Page)
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  xit(`test union constructor ref preceeded by incomplete import`, async () => {
    const source = `
--@ main.elm
import Foo as
import App exposing (Page(..))
defaultPage = Home
              --^App.elm
--@ App.elmtest union constructor ref in
module App exposing (Page(Home))
type Page = Home
--@Foo.elm
module Foo exposing(..)
`;
    await testBase.testDefinition(source);
  });

  xit(`test union constructor ref in pattern destructuring`, async () => {
    const source = `
--@ main.elm
import App exposing (Page(Home))
title page =
    case page of
        Home -> "home"
        --^App.elm
--@ App.elm
module App exposing (Page(Home))
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  it(`test type alias ref in import declaration`, async () => {
    const source = `
--@ main.elm
import App exposing (Person)
                     --^App.elm
--@ App.elm
module App exposing (Person)
type alias Person = { name : String, age: Int }
`;
    await testBase.testDefinition(source);
  });

  it(`test type alias ref in body`, async () => {
    const source = `
--@ main.elm
import App exposing (Person)
type Entity = PersonEntity Person
                           --^App.elm
--@ App.elm
module App exposing (Person)
type alias Person = { name : String, age: Int }
`;
    await testBase.testDefinition(source);
  });

  it(`test type alias import exposing all from both sides`, async () => {
    const source = `
--@ main.elm
import App exposing (..)
type Entity = PersonEntity Person
                           --^App.elm
--@ App.elm
module App exposing (..)
type alias Person = { name : String, age: Int }
`;
    await testBase.testDefinition(source);
  });

  it(`test record constructor ref in expression`, async () => {
    const source = `
--@ main.elm
import App exposing (Person)
defaultPerson = Person "George" 42
                --^App.elm
--@ App.elm
module App exposing (Person)
type alias Person = { name : String, age: Int }
`;
    await testBase.testDefinition(source);
  });

  it(`test record constructor import exposing all from both sides`, async () => {
    const source = `
--@ main.elm
import App exposing (..)
defaultPerson = Person "George" 42
                --^App.elm
--@ App.elm
module App exposing (..)
type alias Person = { name : String, age: Int }
`;
    await testBase.testDefinition(source);
  });

  it(`test union type import exposing all`, async () => {
    const source = `
--@ main.elm
import App exposing (..)
type alias Model = Page
                   --^App.elm
--@ App.elm
module App exposing (Page)
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  it(`test union type import exposing all from both sides`, async () => {
    const source = `
--@ main.elm
import App exposing (..)
type alias Model = Page
                   --^App.elm
--@ App.elm
module App exposing (..)
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  it(`test union type import exposing all but not exposed by module`, async () => {
    const source = `
--@ main.elm
import App exposing (..)
type alias Model = Page
                   --^unresolved
--@ App.elm
module App exposing ()
type Page = Home
`;
    await testBase.testDefinition(source);
  });

  it(`test module-name ref from import`, async () => {
    const source = `
--@ main.elm
import App
       --^App.elm
--@ App.elm
module App exposing (..)
`;
    await testBase.testDefinition(source);
  });

  it(`test dotted module-name ref from import`, async () => {
    const source = `
--@ main.elm
import Data.User
       --^Data/User.elm
--@ Data/User.elm
module Data.User exposing (..)
`;
    await testBase.testDefinition(source);
  });

  xit(`test port ref`, async () => {
    const source = `
--@ main.elm
import Ports exposing (foo)
                       --^Ports.elm
--@ Ports.elm
port module Ports exposing (foo)
port foo : String -> Cmd msg
`;
    await testBase.testDefinition(source);
  });

  // BINARY OPERATORS

  xit(`test binary operator in import exposing list`, async () => {
    const source = `
--@ main.elm
import Math exposing ((**))
                      --^Math.elm
--@ Math.elm
module Math exposing ((**))
infix left 5 (**) = power
power a b = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test binary operator usage in value expression`, async () => {
    const source = `
--@ main.elm
import Math exposing ((**))
f = 2 ** 3
     --^Math.elm
--@ Math.elm
module Math exposing ((**))
infix left 5 (**) = power
power a b = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test binary operator via import exposing all`, async () => {
    const source = `
--@ main.elm
import Math exposing (..)
f = 2 ** 3
     --^Math.elm
--@ Math.elm
module Math exposing ((**))
infix left 5 (**) = power
power a b = 42
`;
    await testBase.testDefinition(source);
  });

  xit(`test binary operator as a function`, async () => {
    const source = `
--@ main.elm
import Math exposing ((**))
f = (**) 2 3
    --^Math.elm
--@ Math.elm
module Math exposing ((**))
infix left 5 (**) = power
power a b = 42
`;
    await testBase.testDefinition(source);
  });

  it(`test layered import using second import`, async () => {
    const source = `
--@ main.elm
import Foo as F
import FooExtra as F
main = F.quux
         --^FooExtra.elm
--@ Foo.elm
module Foo exposing (..)
bar = 42
--@ FooExtra.elm
module FooExtra exposing (..)
quux = 99
`;
    await testBase.testDefinition(source);
  });
});
