import { testCodeAction } from "./codeActionTestBase.js";

describe("make external declaration from usage", () => {
  it("make external function", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import App

func = App.bar
          --^

--@ App.elm
module App exposing (foo)

foo = ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import App

func = App.bar
          --^

--@ App.elm
module App exposing (foo, bar)

foo = ""



bar : a
bar =
    Debug.todo "TODO"`;

    await testCodeAction(
      source,
      [{ title: `Create function in module 'App'` }],
      expectedSource,
    );
  });

  it("make external function in nested module", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Modules.App

func = Modules.App.bar
                  --^

--@ Modules/App.elm
module Modules.App exposing (foo)

foo = ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Modules.App

func = Modules.App.bar

--@ Modules/App.elm
module Modules.App exposing (foo, bar)

foo = ""



bar : a
bar =
    Debug.todo "TODO"`;

    await testCodeAction(
      source,
      [{ title: `Create function in module 'Modules.App'` }],
      expectedSource,
    );
  });

  it("make external function in aliased module", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Modules.App as App

func = App.bar
          --^

--@ Modules/App.elm
module Modules.App exposing (foo)

foo = ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Modules.App as App

func = App.bar

--@ Modules/App.elm
module Modules.App exposing (foo, bar)

foo = ""



bar : a
bar =
    Debug.todo "TODO"`;

    await testCodeAction(
      source,
      [{ title: `Create function in module 'Modules.App'` }],
      expectedSource,
    );
  });

  it("make external function in multiple modules", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Modules.App as App
import App

func = App.bar
          --^

--@ Modules/App.elm
module Modules.App exposing (foo)

foo = ""

--@ App.elm
module Modules.App exposing (foo)

foo = ""
`;

    await testCodeAction(source, [
      { title: `Create function in module 'Modules.App'` },
      { title: `Create function in module 'App'` },
    ]);
  });

  it("make external function in non existent module", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Modules.App as App

func = App.bar
          --^
`;

    await testCodeAction(source, []);
  });
});
