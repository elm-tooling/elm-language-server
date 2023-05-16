import "reflect-metadata";
import { URI } from "vscode-uri";
import { formatText } from "../src/common/util/diff";
import { container } from "tsyringe";
import { createNodeFileSystemHost } from "../src/node";

describe("test formatting", () => {
  const pathUri = URI.file(__dirname);

  test("normal format gives correct result", () => {
    const result = formatText(
      pathUri,
      "elm-format",
      `
module Main

import Browser
import Html exposing (Html, button, div, text)
import Html.Events exposing (onClick)


type alias Model =
    { count : Int }


initialModel : Model
initialModel =
    { count = 0 }


type Msg
    = Increment
    | Decrement


update : Msg -> Model -> Model
update msg model =
    case msg of
        Increment ->
            { model | count = model.count + 1 }

        Decrement ->
            { model | count = model.count - 1 }


view : Model -> Html Msg
view model =
    div []
        [ button [ onClick Increment ] [ text "+1" ]
        , div [] [ text <| String.fromInt model.count ]
        , button [ onClick Decrement ] [ text "-1" ]
        ]


main : Program () Model Msg
main =
    Browser.sandbox
        { init = initialModel
        , view = view
        , update = update
        }
      `,
      createNodeFileSystemHost(container.resolve("Connection")),
    );

    expect(result).toMatchSnapshot();
  });
});
