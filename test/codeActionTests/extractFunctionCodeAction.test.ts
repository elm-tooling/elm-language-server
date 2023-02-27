import { testCodeAction } from "./codeActionTestBase";

describe("extract function code action", () => {
  it("should extract function and compute parameters", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

val2 = 
    0

foo val str =
    case val of
        Just { field1, field2, field3 } ->
            case field1 of
          --^
                Just { prop1, prop2 } ->
                    prop1 + prop2 + val + field2

                Nothing ->
                    field2 + val2
                               --^

        Nothing ->
            str + val2
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

val2 = 
    0

foo val str =
    case val of
        Just { field1, field2, field3 } ->
            newFunction field1 val field2

        Nothing ->
            str + val2


newFunction : Maybe { a | prop1 : number, prop2 : number } -> Maybe { b | field1 : Maybe { a | prop1 : number, prop2 : number }, field2 : unknown, field3 : c } -> unknown -> unknown
newFunction field1 val field2 =
    case field1 of
        Just { prop1, prop2 } ->
            prop1 + prop2 + val + field2

        Nothing ->
            field2 + val2
`;

    await testCodeAction(
      source,
      [{ title: "Extract function to top level" }],
      expectedSource,
    );
  });

  it("should extract function - without inner destructured parameters", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

val2 = 
    0

foo val str =
    case val of
        Just { field1, field2, field3 } ->
            (\\{ prop1, prop2 } ->
          --^
                prop1 + prop2 + val + field2)
            field1
                --^

        Nothing ->
            str + val2
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

val2 = 
    0

foo val str =
    case val of
        Just { field1, field2, field3 } ->
            newFunction val field2 field1

        Nothing ->
            str + val2


newFunction : Maybe { a | field1 : { b | prop1 : number, prop2 : number }, field2 : unknown, field3 : c } -> unknown -> { b | prop1 : number, prop2 : number } -> unknown
newFunction val field2 field1 =
    (\\{ prop1, prop2 } ->
        prop1 + prop2 + val + field2)
    field1
`;

    await testCodeAction(
      source,
      [{ title: "Extract function to top level" }],
      expectedSource,
    );
  });

  it("should extract function - without external record field parameters", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

val2 = 
    0

type alias Field1 =
    { prop1: Int, prop2: Int }

foo : Maybe { field1: Field1, field2: Int, field3: Int } -> Int -> Int
foo val str =
    case val of
        Just { field1, field2, field3 } ->
            (\\{ prop1, prop2 } ->
          --^
                prop1 + prop2 + val + field2)
            field1
                --^

        Nothing ->
            str + val2
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

val2 = 
    0

type alias Field1 =
    { prop1: Int, prop2: Int }

foo : Maybe { field1: Field1, field2: Int, field3: Int } -> Int -> Int
foo val str =
    case val of
        Just { field1, field2, field3 } ->
            newFunction val field2 field1

        Nothing ->
            str + val2


newFunction : Maybe { field1 : Field1, field2 : Int, field3 : Int } -> Int -> Field1 -> unknown
newFunction val field2 field1 =
    (\\{ prop1, prop2 } ->
        prop1 + prop2 + val + field2)
    field1
`;

    await testCodeAction(
      source,
      [{ title: "Extract function to top level" }],
      expectedSource,
    );
  });

  it("should extract function - without parameter from another file", async () => {
    const source = `
--@ Foo.elm
module Foo exposing (..)

val2 = 
    0

--@ Test.elm
module Test exposing (..)

import Foo exposing (..)

foo val =
    val 
  --^
        + val2 
        + Foo.val2
                --^
  
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Foo exposing (..)

foo val =
    newFunction val


newFunction : number -> number
newFunction val =
    val 
        + val2 
        + Foo.val2

`;

    await testCodeAction(
      source,
      [{ title: "Extract function to top level" }],
      expectedSource,
    );
  });

  it("should extract function to enclosing let - no parameters", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

val2 = 
    0

foo val str =
    case val of
        Just { field1, field2, field3 } ->
            let
                field4 = 
                    0
            in
            case field1 of
          --^
                Just { prop1, prop2 } ->
                    prop1 + prop2 + val + field2 + field4

                Nothing ->
                    field2 + val2
                               --^

        Nothing ->
            str + val2
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

val2 = 
    0

foo val str =
    case val of
        Just { field1, field2, field3 } ->
            let
                field4 = 
                    0


                newFunction = 
                    case field1 of
                        Just { prop1, prop2 } ->
                            prop1 + prop2 + val + field2 + field4

                        Nothing ->
                            field2 + val2
            in
            newFunction

        Nothing ->
            str + val2
`;

    await testCodeAction(
      source,
      [{ title: "Extract function to enclosing let" }],
      expectedSource,
    );
  });

  it("should extract function to enclosing let - some parameters", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

val2 = 
    0

foo val str =
    let
        field4 = 
            0
    in
    case val of
        Just { field1, field2, field3 } ->
            case field1 of
          --^
                Just { prop1, prop2 } ->
                    prop1 + prop2 + val + field2 + field4

                Nothing ->
                    field2 + val2
                               --^

        Nothing ->
            str + val2
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

val2 = 
    0

foo val str =
    let
        field4 = 
            0


        newFunction field1 field2 = 
            case field1 of
                Just { prop1, prop2 } ->
                    prop1 + prop2 + val + field2 + field4

                Nothing ->
                    field2 + val2
    in
    case val of
        Just { field1, field2, field3 } ->
            newFunction field1 field2

        Nothing ->
            str + val2
`;

    await testCodeAction(
      source,
      [{ title: "Extract function to enclosing let" }],
      expectedSource,
    );
  });
});
