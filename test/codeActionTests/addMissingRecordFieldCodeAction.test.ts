import { testCodeAction } from "./codeActionTestBase";

describe("add missing record field code action", () => {
  it("should work with type alias on a single line", async () => {
    const source = `
		--@ Test.elm
module Test exposing (..)

type alias Model = { field : Int }

func : Model -> Float
func model =
		model.newProp
			     --^
		`;

    const expectedSource = `
		--@ Test.elm
module Test exposing (..)

type alias Model = { field : Int, newProp : Float }

func : Model -> Float
func model =
		model.newProp
		`;

    await testCodeAction(
      source,
      [{ title: "Create missing record field" }],
      expectedSource,
    );
  });

  it("should work with type alias on a multiple lines", async () => {
    const source = `
		--@ Test.elm
module Test exposing (..)

type alias Model = 
  { field : Int
	}

func : Model -> { prop : Int }
func model =
		model.newProp
			     --^
		`;

    const expectedSource = `
		--@ Test.elm
module Test exposing (..)

type alias Model = 
  { field : Int
  , newProp : { prop : Int }
	}

func : Model -> { prop : Int }
func model =
		model.newProp
		`;

    await testCodeAction(
      source,
      [{ title: "Create missing record field" }],
      expectedSource,
    );
  });

  it("should work with record update expr", async () => {
    const source = `
--@ String.elm
module String exposing (String)

type String = String

--@ Test.elm
module Test exposing (..)

func : { field : Int } -> a
func model =
		{ model | newProp = "" } 
			         --^
		`;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

func : { field : Int, newProp : String } -> a
func model =
		{ model | newProp = "" } 
		`;

    await testCodeAction(
      source,
      [{ title: "Create missing record field" }],
      expectedSource,
    );
  });
});
