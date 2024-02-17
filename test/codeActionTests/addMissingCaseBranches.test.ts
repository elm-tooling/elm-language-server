import { testCodeAction } from "./codeActionTestBase";

describe("add missing record field code action", () => {
  it("should work with a normal case expr", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func a =
    case a of
    --^
        1 ->
            ""

        2 ->
            ""

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func a =
    case a of
        1 ->
            ""

        2 ->
            ""

        _ ->
            Debug.todo "branch '_' not implemented"

`;

    await testCodeAction(
      source,
      [{ title: "Add missing case branches" }],
      expectedSource,
    );
  });

  it("should work with a nested case expr", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

type Maybe a = Just a | Nothing

func a b =
    case a of
        1 ->
            ""

        2 ->
            case b of
            --^
                Nothing ->
                    ""

        _ ->
            ""
    `;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

type Maybe a = Just a | Nothing

func a b =
    case a of
        1 ->
            ""

        2 ->
            case b of
                Nothing ->
                    ""

                Just _ ->
                    Debug.todo "branch 'Just _' not implemented"

        _ ->
            ""
    `;

    await testCodeAction(
      source,
      [{ title: "Add missing case branches" }],
      expectedSource,
    );
  });

  it("should add missing cases inside of ()", async () => {
    const source = `
    --@ Test.elm
module Test exposing (..)

func a =
    (case a of
    --^
        1 ->
            ""
    )
        |> Debug.log "test"
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func a =
    (case a of
        1 ->
            ""

        _ ->
            Debug.todo "branch '_' not implemented"
    )
        |> Debug.log "test"
`;

    await testCodeAction(
      source,
      [{ title: "Add missing case branches" }],
      expectedSource,
    );
  });
});
