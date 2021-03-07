import { testCodeAction } from "./codeActionTestBase";

describe("swap list item code action", () => {
  it("should swap item a with b in horizontal list, and keep whitespace as-is", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ "Apple", "Banana" ]
    --^

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ "Banana", "Apple" ]

`;

    await testCodeAction(
      source,
      [{ title: "Move list item down" }],
      expectedSource,
    );
  });

  it("should swap item Apple with Banana in vertical list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ "Apple"
    --^
    , "Banana"
    , "Cucumber" 
    ]

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ "Banana" 
    , "Apple"
    , "Cucumber" 
    ]

`;

    await testCodeAction(
      source,
      [{ title: "Move list item down" }],
      expectedSource,
    );
  });

  it("should swap item Banana with Cucumber and keep formatting in non elm-format formatted list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ "Apple",
      "Banana",
        --^
      "Cucumber",
      "Date"
    ]
`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ "Apple",
      "Cucumber",
      "Banana",
      "Date"
    ]
`;

    await testCodeAction(
      source,
      [{ title: "Move list item down" }],
      expectedSource,
    );
  });

  it("should swap item aa with bb in vertical list upwards", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ -- Comment
      let 
        a = "1" 
      in 
      a
    , "bb"
    --^
    , "cc" 
    ]

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ "bb"
    , -- Comment
      let 
        a = "1" 
      in 
      a
    , "cc" 
    ]

`;

    await testCodeAction(
      source,
      [{ title: "Move list item up" }],
      expectedSource,
    );
  });

  it("should move comment along with item in vertical list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ -- CommentAA
      -- Comment line 2
      "aa"
     --^
    , "bb"
    ]

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ "bb"
    , -- CommentAA
      -- Comment line 2
      "aa" 
    ]

`;

    await testCodeAction(
      source,
      [{ title: "Move list item down" }],
      expectedSource,
    );
  });

  it("should move block_comment along with item in vertical list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ {-| CommentAA
      -}
      "aa"
     --^
    , "bb"
    ]

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ "bb"
    , {-| CommentAA
      -}
      "aa"
    ]

`;

    await testCodeAction(
      source,
      [{ title: "Move list item down" }],
      expectedSource,
    );
  });

  it("should NOT move comment in preceding item along with item in vertical list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ "aa"
     --^
     
      -- "bb"
    , "bb"
    ]

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ "bb"
    , "aa"

      -- "bb"
    ]

`;

    await testCodeAction(
      source,
      [{ title: "Move list item down" }],
      expectedSource,
    );
  });

  it("should handle nested lists, and move only within the closest parent list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ [ "Red Apple", "Green Apple" ]
        --^
    , [ "Banana" ]
    ]

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ [ "Green Apple", "Red Apple" ]
    , [ "Banana" ]
    ]

`;

    await testCodeAction(
      source,
      [{ title: "Move list item down" }],
      expectedSource,
    );
  });

  it("should handle nested lists, and moving lists within lists", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ [ "Red Apple", "Green Apple" ]
    --^ 
    , [ "Banana" ]
    ]

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ [ "Banana" ]
    , [ "Red Apple", "Green Apple" ]
    ]

`;

    await testCodeAction(
      source,
      [{ title: "Move list item down" }],
      expectedSource,
    );
  });

  it("should not handle unfinished lists?", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    ([ "aa"
     --^
     , "bb"
    )

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    ([ "bb"
     , "aa"    
    )

`;

    // await testCodeAction(source, [], expectedSource);
  });
});
