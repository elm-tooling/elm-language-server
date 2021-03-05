import { testCodeAction } from "./codeActionTestBase";

describe("remove unused code action", () => {
  it("removing an import at the start of exposing list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo, bar, Maybe, Result(..))
                    --^

func = ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (bar, Maybe, Result(..))

func = ""
`;

    await testCodeAction(
      source,
      [{ title: "Remove unused value `foo`" }],
      expectedSource,
    );
  });

  it("removing an import in the middle of exposing list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo, bar, Maybe, Result(..))
                               --^

func = ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo, bar, Result(..))

func = ""
`;

    await testCodeAction(
      source,
      [{ title: "Remove unused value `Maybe`" }],
      expectedSource,
    );
  });

  it("removing an import at the end of exposing list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo, bar, Maybe, Result)
                                      --^

func = ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo, bar, Maybe)

func = ""
`;

    await testCodeAction(
      source,
      [{ title: "Remove unused value `Result`" }],
      expectedSource,
    );
  });

  it("removing an import at the end of exposing list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo, bar, Maybe, Result)
                                      --^

func = ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo, bar, Maybe)

func = ""
`;

    await testCodeAction(
      source,
      [{ title: "Remove unused value `Result`" }],
      expectedSource,
    );
  });

  it("removing all imports in exposing list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo, bar, Maybe, Result)
                    --^

func = ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo

func = ""
`;

    await testCodeAction(
      source,
      [{ title: "Remove all unused code" }],
      expectedSource,
      true,
    );
  });

  it("removing all imports in exposing list except the first", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo, bar, Maybe, Result)
                         --^

func = foo
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo)

func = foo
`;

    await testCodeAction(
      source,
      [{ title: "Remove all unused code" }],
      expectedSource,
      true,
    );
  });

  it("removing all imports in exposing list except the middle", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (bar, Maybe, foo, Result)
                    --^

func = foo
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo)

func = foo
`;

    await testCodeAction(
      source,
      [{ title: "Remove all unused code" }],
      expectedSource,
      true,
    );
  });

  it("removing all imports in exposing list except the end", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (bar, Maybe, Result, foo)
                    --^

func = foo
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo)

func = foo
`;

    await testCodeAction(
      source,
      [{ title: "Remove all unused code" }],
      expectedSource,
      true,
    );
  });
});
