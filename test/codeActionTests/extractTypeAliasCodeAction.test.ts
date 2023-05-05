import { testCodeAction } from "./codeActionTestBase";

describe("extract type alias code action", () => {
  it("should extract type alias of a record", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


foo : Maybe { a : Int, b : Float }
          --^                  --^  
foo = 
    Nothing
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)


type alias NewType = { a : Int, b : Float }


foo : Maybe NewType
foo = 
    Nothing
`;

    await testCodeAction(
      source,
      [{ title: "Extract type alias" }],
      expectedSource,
    );
  });

  it("should extract type alias of a type and record", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


foo : Maybe { a : Int, b : Float }
    --^                        --^  
foo = 
    Nothing
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)


type alias NewType = Maybe { a : Int, b : Float }


foo : NewType
foo = 
    Nothing
`;

    await testCodeAction(
      source,
      [{ title: "Extract type alias" }],
      expectedSource,
    );
  });

  it("should extract type alias of a type with other function arguments", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


foo : Maybe { a : Int, b : Float } -> Int -> String
    --^                        --^  
foo a b = 
    ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)


type alias NewType = Maybe { a : Int, b : Float }


foo : NewType -> Int -> String
foo a b = 
    ""
`;

    await testCodeAction(
      source,
      [{ title: "Extract type alias" }],
      expectedSource,
    );
  });

  it("should extract type alias of a function", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


foo : Maybe { a : Int, b : Float } -> Int -> String
    --^                                         --^  
foo a b = 
    ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)


type alias NewType = Maybe { a : Int, b : Float } -> Int -> String


foo : NewType
foo a b = 
    ""
`;

    await testCodeAction(
      source,
      [{ title: "Extract type alias" }],
      expectedSource,
    );
  });

  it("should extract type alias of a partial type expression", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


foo : Maybe { a : Int, b : Float } -> Int -> String
    --^                               --^  
foo a b = 
    ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)


type alias NewType = Maybe { a : Int, b : Float } -> Int


foo : NewType -> String
foo a b = 
    ""
`;

    await testCodeAction(
      source,
      [{ title: "Extract type alias" }],
      expectedSource,
    );
  });

  it("should extract type alias of a partial type expression spanning multiple lines", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


foo : 
  Maybe { a : Int, b : Float }
--^ 
  -> Int 
     --^
  -> String
foo a b = 
    ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)


type alias NewType = Maybe { a : Int, b : Float } -> Int


foo : 
  NewType 
  -> String
foo a b = 
    ""
`;

    await testCodeAction(
      source,
      [{ title: "Extract type alias" }],
      expectedSource,
    );
  });

  it("should extract type alias of a type with parenthesis", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


foo : (Maybe { a : Int, b : Float } -> Int) -> String
    --^                                 --^  
foo f = 
    ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)


type alias NewType = Maybe { a : Int, b : Float } -> Int


foo : NewType -> String
foo f = 
    ""
`;

    await testCodeAction(
      source,
      [{ title: "Extract type alias" }],
      expectedSource,
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)


foo : (Maybe { a : Int, b : Float } -> Int) -> String
     --^                               --^  
foo f = 
    ""
`;

    const expectedSource2 = `
--@ Test.elm
module Test exposing (..)


type alias NewType = Maybe { a : Int, b : Float } -> Int


foo : (NewType) -> String
foo f = 
    ""
`;

    await testCodeAction(
      source2,
      [{ title: "Extract type alias" }],
      expectedSource2,
    );
  });

  it("should extract type alias of a type with parenthesis spanning multiple lines", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


foo : (
    --^
  Maybe { a : Int, b : Float } -> Int
  ) -> String
--^
foo f = 
    ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)


type alias NewType = Maybe { a : Int, b : Float } -> Int


foo : NewType -> String
foo f = 
    ""
`;

    await testCodeAction(
      source,
      [{ title: "Extract type alias" }],
      expectedSource,
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)


foo : (
  Maybe { a : Int, b : Float } 
--^
  -> Int
     --^
  ) -> String
foo f = 
    ""
`;

    const expectedSource2 = `
--@ Test.elm
module Test exposing (..)


type alias NewType = Maybe { a : Int, b : Float } 
  -> Int


foo : (
  NewType
  ) -> String
foo f = 
    ""
`;

    await testCodeAction(
      source2,
      [{ title: "Extract type alias" }],
      expectedSource2,
    );
  });

  it("should extract type alias with args", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


foo : Maybe { a : a, b : b } -> a -> String
    --^                                 --^  
foo a b = 
    ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)


type alias NewType a b = Maybe { a : a, b : b } -> a -> String


foo : NewType a b
foo a b = 
    ""
`;

    await testCodeAction(
      source,
      [{ title: "Extract type alias" }],
      expectedSource,
    );
  });

  it("should extract type alias with args with existing args", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


foo : Maybe { a : comparable, b : b } -> comparable -> String
    --^                           --^  
foo a b = 
    ""
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)


type alias NewType comparable b = Maybe { a : comparable, b : b }


foo : NewType comparable b -> comparable -> String
foo a b = 
    ""
`;

    await testCodeAction(
      source,
      [{ title: "Extract type alias" }],
      expectedSource,
    );
  });

  it("should extract type alias and add parenthesis if there was parenthesis and there are args", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)


type Type1 a = 
    Type1 (a -> String) String
        --^         --^
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)


type alias NewType a = a -> String


type Type1 a = 
    Type1 (NewType a) String
`;

    await testCodeAction(
      source,
      [{ title: "Extract type alias" }],
      expectedSource,
    );

    const source2 = `
--@ Test.elm
module Test exposing (..)


type Type1 a = 
    Type1 (a -> String) String
         --^       --^
`;

    const expectedSource2 = `
--@ Test.elm
module Test exposing (..)


type alias NewType a = a -> String


type Type1 a = 
    Type1 (NewType a) String
`;

    await testCodeAction(
      source2,
      [{ title: "Extract type alias" }],
      expectedSource2,
    );
  });
});
