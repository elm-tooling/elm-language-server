import { testCodeAction } from "./codeActionTestBase";

describe("add missing union type code action", () => {
  it("should work in the same file", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Html exposing (Html, div)
import Html.Events exposing (onClick)

type Msg
    = Msg1
    | Msg2

view : Html Msg
view =
    div [ onClick NewMsg ] []
                  --^
    `;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Html exposing (Html, div)
import Html.Events exposing (onClick)

type Msg
    = Msg1
    | Msg2
    | NewMsg

view : Html Msg
view =
    div [ onClick NewMsg ] []
    `;

    await testCodeAction(
      htmlSources + source,
      [{ title: "Create missing union type" }],
      expectedSource,
    );
  });

  it("should work in another file", async () => {
    const source = `
--@ Module.elm
module Module exposing (..)

type Msg
    = Msg1
    | Msg2

--@ Test.elm
module Test exposing (..)

import Html exposing (Html, div)
import Html.Events exposing (onClick)

import Module exposing (Msg(..))

view : Html Msg
view =
    div [ onClick NewMsg ] []
                  --^
    `;

    const expectedSource = `
--@ Module.elm
module Module exposing (..)

type Msg
    = Msg1
    | Msg2
    | NewMsg
    `;

    await testCodeAction(
      htmlSources + source,
      [{ title: "Create missing union type" }],
      expectedSource,
    );
  });

  it("should work with multiple parameters", async () => {
    const source = `
--@ Test.elm
module Test exposing (..)

import Html exposing (Html, div)
import Html.Events exposing (onInput)

type Msg
    = Msg1
    | Msg2

view : Html Msg
view =
    div [ onInput NewMsg ] []
                  --^
    `;

    const expectedSource = `
--@ Test.elm
module Test exposing (..)

import Html exposing (Html, div)
import Html.Events exposing (onInput)

type Msg
    = Msg1
    | Msg2
    | NewMsg Int

view : Html Msg
view =
    div [ onInput NewMsg ] []
    `;

    await testCodeAction(
      htmlSources + source,
      [{ title: "Create missing union type" }],
      expectedSource,
    );
  });
});

const htmlSources = `
--@ VirtualDom.elm
module VirtualDom exposing (..)

type Node msg = Node

type Attribute msg = Attribute


--@ Html.elm
module Html exposing (..)

import VirtualDom

type alias Html msg = VirtualDom.Node msg

type alias Attribute msg = VirtualDom.Attribute msg

div : List (Attribute msg) -> List (Html msg) -> Html msg
div =
  Elm.Kernel.VirtualDom.node "div"


--@ Html/Events.elm
module Html.Events exposing (..)

import Html exposing (Attribute)

onClick : msg -> Attribute msg
onClick msg =
  on "click" (Json.succeed msg)

onInput : (Int -> msg) -> Attribute msg
onInput tagger =
  stopPropagationOn "input" (Json.map alwaysStop (Json.map tagger targetValue))


`;
