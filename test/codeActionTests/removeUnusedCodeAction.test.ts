import { testCodeAction } from "./codeActionTestBase.js";

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

  it("removing a wholly unused import and its exposing list", async () => {
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


func = ""
`;

    await testCodeAction(
      source,
      [{ title: "Remove all reported unused code" }],
      expectedSource,
      { testFixAll: true },
    );
  });

  it("removes a wholly unused import in one quick fix", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo as F exposing (foo, Bar)
       --^

func = ""
`;
    const expectedSource = `
--@ Test.elm
module Test exposing (..)


func = ""
`;
    await testCodeAction(
      source,
      [{ title: "Remove unused import `Foo`" }],
      expectedSource,
    );
  });

  it("fixes overlapping import, alias and exposure diagnostics across imports", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo as F exposing (foo, Bar)
       --^
import Other exposing (other)
import Used as U exposing (unused)

func = U.value
`;
    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Used as U

func = U.value
`;
    const actions = await testCodeAction(
      source,
      [{ title: "Remove all reported unused code" }],
      expectedSource,
      { testFixAll: true },
    );
    const action = actions.find(
      (action) => action.title === "Remove all reported unused code",
    );
    const changes = action?.edit?.changes;
    if (!changes) {
      throw new Error("Expected fix-all edits");
    }
    for (const edits of Object.values(changes)) {
      for (let i = 1; i < edits.length; i++) {
        const previousEnd = edits[i - 1].range.end;
        const start = edits[i].range.start;
        expect(
          previousEnd.line < start.line ||
            (previousEnd.line === start.line &&
              previousEnd.character <= start.character),
        ).toBe(true);
      }
    }
  });

  it.each(["Foo", "Foo as F"])(
    "retains qualified usage when removing all exposures from %s",
    async (clause) => {
      const qualifier = clause === "Foo" ? "Foo" : "F";
      const source = `
--@ Test.elm
module Test exposing (..)

import ${clause} exposing (foo, Bar)
                         --^

func = ${qualifier}.value
`;
      const expectedSource = `
--@ Test.elm
module Test exposing (..)

import ${clause}

func = ${qualifier}.value
`;
      await testCodeAction(
        source,
        [{ title: "Remove all reported unused code" }],
        expectedSource,
        { testFixAll: true },
      );
    },
  );

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
      [{ title: "Remove all reported unused code" }],
      expectedSource,
      { testFixAll: true },
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
      [{ title: "Remove all reported unused code" }],
      expectedSource,
      { testFixAll: true },
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
      [{ title: "Remove all reported unused code" }],
      expectedSource,
      { testFixAll: true },
    );
  });

  it("removing some imports in exposing list - 1st and 3rd", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (Maybe, foo, Result, bar)
                    --^

func = foo + bar
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (foo, bar)

func = foo + bar
`;

    await testCodeAction(
      source,
      [{ title: "Remove all reported unused code" }],
      expectedSource,
      { testFixAll: true },
    );
  });

  it("removing some imports in exposing list - 2nd and 4th", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (bar, Maybe, foo, Result)
                          --^

func = foo + bar
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (bar, foo)

func = foo + bar
`;

    await testCodeAction(
      source,
      [{ title: "Remove all reported unused code" }],
      expectedSource,
      { testFixAll: true },
    );
  });

  it("removing some imports in exposing list - last 2", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (bar, foo, Maybe, Result)
                              --^

func = foo + bar
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (bar, foo)

func = foo + bar
`;

    await testCodeAction(
      source,
      [{ title: "Remove all reported unused code" }],
      expectedSource,
      { testFixAll: true },
    );
  });

  it("removing some imports in exposing list - first 2", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (Maybe, Result, bar, foo)
                            --^

func = foo + bar
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (bar, foo)

func = foo + bar
`;

    await testCodeAction(
      source,
      [{ title: "Remove all reported unused code" }],
      expectedSource,
      { testFixAll: true },
    );
  });

  it("removing type with single unused value constructor removes entire type", async () => {
    const source = `
--@ Test.elm
module Test exposing (func)

type Foo 
    = Bar
     --^

func = 1
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (func)



func = 1
`;

    await testCodeAction(
      source,
      [{ title: "Remove unused value constructor `Bar`" }],
      expectedSource,
      true,
    );
  });

  it("removing unused value constructor", async () => {
    const source = `
--@ Test.elm
module Test exposing (func)

type Foo 
    = Bar
    | Baz
     --^

func = Bar
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (func)

type Foo 
    = Bar

func = Bar
`;

    await testCodeAction(
      source,
      [{ title: "Remove unused value constructor `Baz`" }],
      expectedSource,
      true,
    );
  });

  it("removing unused value constructor also removes associated data type", async () => {
    const source = `
--@ Test.elm
module Test exposing (func)

type Foo 
    = Bar
    | Baz Int
     --^

func = Bar
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (func)

type Foo 
    = Bar

func = Bar
`;

    await testCodeAction(
      source,
      [{ title: "Remove unused value constructor `Baz`" }],
      expectedSource,
      true,
    );
  });
});
