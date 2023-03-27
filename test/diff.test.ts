import "reflect-metadata";
import { container } from "tsyringe";
import { URI } from "vscode-uri";
import { formatText } from "../src/util/diff";
import { Connection } from "vscode-languageserver";

container.register("Connection", {
  useValue: {
    console: {
      info: (a: string): void => {
        // console.log(a);
      },
      warn: (a: string): void => {
        // console.log(a);
      },
      error: (a: string): void => {
        // console.log(a);
      },
    },
    window: {
      showErrorMessage: (a: string): void => {
        console.log(a);
      },
    },
  },
});
describe("test formatting", () => {
  const connection = container.resolve<Connection>("Connection");
  const pathUri = URI.file(__dirname);

  test("normal format gives correct result", async () => {
    const result = await formatText(
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
      connection,
    );

    expect(result).toMatchSnapshot();
  });
});
