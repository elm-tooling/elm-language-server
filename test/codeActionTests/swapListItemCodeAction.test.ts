import { testCodeAction } from "./codeActionTestBase";

describe("swap list item code action", () => {
  it("should swap item aa with bb in horizontal list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ "aa", "bb", "cc" ]
    --^

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ "bb", "aa", "cc" ]

`;

    await testCodeAction(
      source,
      [{ title: "Move list item down" }],
      expectedSource,
    );
  });

  it("should swap item aa with bb in vertical list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ "aa"
    --^
    , "bb"
    , "cc" 
    ]

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ "bb"
    , "aa" 
    , "cc" 
    ]

`;

    await testCodeAction(
      source,
      [{ title: "Move list item down" }],
      expectedSource,
    );
  });
  it("should swap item aa with bb in non-standard formatted list", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

func =
    [ "a", "bbb",
    --^
      "cc"
    ]

`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func =
    [ "bbb", "a",
      "cc" 
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
        a = 1 
      in 
      "aa"
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
        a = 1 
      in 
      "aa" 
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
