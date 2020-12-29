import Parser from "web-tree-sitter";
import { ISourceMapHost, SourceMapWatcher } from "../src/compiler/sourcemap";
import { getSourceFiles } from "./utils/sourceParser";
import { baseUri, SourceTreeParser } from "./utils/sourceTreeParser";
import path from "path";
import { container } from "tsyringe";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { IProgram } from "../src/compiler/program";

async function loadJsParser() {
  if (container.isRegistered("JsParser")) {
    return;
  }

  await Parser.init();
  const absolute = path.join(__dirname, "../tree-sitter-javascript.wasm");
  const pathToWasm = path.relative(process.cwd(), absolute);

  const language = await Parser.Language.load(pathToWasm);
  container.registerSingleton("JsParser", Parser);
  container.resolve<Parser>("JsParser").setLanguage(language);
}

describe("source map test", () => {
  const treeParser = new SourceTreeParser();
  async function testSourceMap(
    elmSource: string,
    jsSource: string,
    expectedMappings: string,
    openSourceMapVisualize = false,
  ): Promise<void> {
    await treeParser.init();
    await loadJsParser();

    if (
      !openSourceMapVisualize &&
      process.argv.find((arg) => arg === "--debug")
    ) {
      return;
    }

    elmSource = elmSource.trim();
    jsSource = `(function(scope){\n${jsSource}\n}(this));`;

    const jsPath = path.join(baseUri, "elm.js");

    const program = await treeParser.getProgram(getSourceFiles(elmSource));
    program.getTypeChecker(); // Need to bind the files first

    const workspaces = container.resolve<IProgram[]>("ElmWorkspaces");
    workspaces.splice(0, workspaces.length);
    workspaces.push(program);

    let sourceMap: string | undefined;
    const host: ISourceMapHost = {
      readFile: (path) => {
        if (path === jsPath) {
          return jsSource;
        }
        return "";
      },
      writeFile: (path, content) => {
        if (path.endsWith("elm.js.map")) {
          sourceMap = content;
        }
      },
    };

    new SourceMapWatcher(program).generateSourceMap(jsPath, host);

    if (!sourceMap) {
      fail();
    }

    if (openSourceMapVisualize) {
      if (!existsSync("./.temp")) {
        mkdirSync("./.temp");
      }

      const jsTempPath = path.resolve("./.temp/elm.js");
      writeFileSync(jsTempPath, jsSource);
      new SourceMapWatcher(program).generateSourceMap(jsTempPath, undefined, 0);
      spawnSync("source-map-visualize", [jsTempPath], {
        stdio: "inherit",
      });
    }

    expect(JSON.parse(sourceMap).mappings).toBe(expectedMappings);
  }

  it("basic mapping of case of expr", async () => {
    await testSourceMap(
      `
module Main exposing (..)

type State
    = Playing Player
    | Won Player
    | Draw

type Msg
    = PlaceMark Int
    | NewGame

update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        PlaceMark index ->
            case model.state of
                Playing currentPlayer ->
                    ( executeMove index currentPlayer model, Cmd.none )

                _ ->
                    ( model, Cmd.none )

        NewGame ->
            init
    `,
      `
var $author$project$Main$update = F2(
  function (msg, model) {
    if (msg.$ === 'PlaceMark') {
      var index = msg.a;
      var _v1 = model.state;
      if (_v1.$ === 'Playing') {
        var currentPlayer = _v1.a;
        return _Utils_Tuple2(
          A3($author$project$Main$executeMove, index, currentPlayer, model),
          $elm$core$Platform$Cmd$none);
      } else {
        return _Utils_Tuple2(model, $elm$core$Platform$Cmd$none);
      }
    } else {
      return $author$project$Main$init;
    }
  });
    `,
      `;;;;IAaI;;MAEQ;;;QAEQ;;;;QAGA;;;MAGR`,
    );
  });

  it("mapping of complex case of expr with a let", async () => {
    await testSourceMap(
      `
module Main exposing (..)

checkVictory : Board -> Maybe Player
checkVictory board =
    let
        winningLines =
            List.filter isWinningLine (allLines board)
    in
    case winningLines of
        winningLine :: _ ->
            case winningLine of
                square :: _ ->
                    Maybe.map playerFromMark square

                _ ->
                    Nothing

        _ ->
            Nothing
    `,
      `
var $author$project$Main$checkVictory = function (board) {
  var winningLines = A2(
    $elm$core$List$filter,
    $author$project$Main$isWinningLine,
    $author$project$Main$allLines(board));
  if (winningLines.b) {
    var winningLine = winningLines.a;
    if (winningLine.b) {
      var square = winningLine.a;
      return A2($elm$core$Maybe$map, $author$project$Main$playerFromMark, square);
    } else {
      return $elm$core$Maybe$Nothing;
    }
  } else {
    return $elm$core$Maybe$Nothing;
  }
};
    `,
      `;;;EAII,mBAEQ;;;;EAER;;IAEQ;;MAEQ;;MAGA;;;IAGR`,
    );
  });

  it("mapping should be after pattern variable assignment", async () => {
    await testSourceMap(
      `
module Main exposing (..)

isBoardFull : Board -> Bool
isBoardFull { a0, a1, a2, b0, b1, b2, c0, c1, c2 } =
    [ a0, a1, a2, b0, b1, b2, c0, c1, c2 ]
        |> List.all (\\square -> square /= Nothing)
    `,
      `
var $author$project$Main$isBoardFull = function (_v0) {
  var a0 = _v0.a0;
  var a1 = _v0.a1;
  var a2 = _v0.a2;
  var b0 = _v0.b0;
  var b1 = _v0.b1;
  var b2 = _v0.b2;
  var c0 = _v0.c0;
  var c1 = _v0.c1;
  var c2 = _v0.c2;
  return A2(
    $elm$core$List$all,
    function (square) {
      return !_Utils_eq(square, $elm$core$Maybe$Nothing);
    },
    _List_fromArray(
      [a0, a1, a2, b0, b1, b2, c0, c1, c2]));
};
    `,
      `;;;;;;;;;;;;EAII;IACO;IAAS;MAAY;;;MAD5B`,
    );
  });

  it("mapping with a case expr that resolves to another function", async () => {
    await testSourceMap(
      `
module Main exposing (..)

type Maybe a = Just a | Nothing

executeMove : Int -> Player -> Model -> Model
executeMove index currentPlayer model =
    let
        newModel =
            { model | board = addMark (markFromPlayer currentPlayer) index model.board }
    in
    case checkVictory newModel.board of
        Just winner ->
            { newModel | state = Won winner }

        Nothing ->
            if isBoardFull newModel.board then
                { newModel | state = Draw }

            else
                { newModel | state = nextPlayer model.state }
    `,
      `
var $author$project$Main$executeMove = F3(
  function (index, currentPlayer, model) {
    var newModel = _Utils_update(
      model,
      {
        board: A3(
          $author$project$Main$addMark,
          $author$project$Main$markFromPlayer(currentPlayer),
          index,
          model.board)
      });
    var _v0 = $author$project$Main$checkVictory(newModel.board);
    if (_v0.$ === 'Just') {
      var winner = _v0.a;
      return _Utils_update(
        newModel,
        {
          state: $author$project$Main$Won(winner)
        });
    } else {
      return $author$project$Main$isBoardFull(newModel.board) ? _Utils_update(
        newModel,
        {state: $author$project$Main$Draw}) : _Utils_update(
        newModel,
        {
          state: $author$project$Main$nextPlayer(model.state)
        });
    }
  });
    `,
      `;;;;IAMI,eAEQ;;;;;;;;;IAER;;;MAEQ;;;;;;MAGA,0DACI;;8CAGA`,
    );
  });

  it("mapping with nested if else expr", async () => {
    await testSourceMap(
      `
module Main exposing (..)

type ValidatedField
    = Username
    | Email
    | Password

validateField : TrimmedForm -> ValidatedField -> List Problem
validateField (Trimmed form) field =
    List.map (InvalidEntry field) <|
        case field of
            Username ->
                if String.isEmpty form.username then
                    [ "username can't be blank." ]

                else
                    []

            Email ->
                if String.isEmpty form.email then
                    [ "email can't be blank." ]

                else
                    []

            Password ->
                if String.isEmpty form.password then
                    [ "password can't be blank." ]

                else if String.length form.password < Viewer.minPasswordChars then
                    [ "password must be at least " ++ String.fromInt Viewer.minPasswordChars ++ " characters long." ]

                else
                    []
    `,
      `
var $author$project$Main$validateField = F2(
  function (_v0, field) {
    var form = _v0.a;
    return A2(
      $elm$core$List$map,
      $author$project$Page$Register$InvalidEntry(field),
      function () {
        switch (field.$) {
          case 'Username':
            return $elm$core$String$isEmpty(form.username) ? _List_fromArray(
              ['username can\'t be blank.']) : _List_Nil;
          case 'Email':
            return $elm$core$String$isEmpty(form.email) ? _List_fromArray(
              ['email can\'t be blank.']) : _List_Nil;
          default:
            return $elm$core$String$isEmpty(form.password) ? _List_fromArray(
              ['password can\'t be blank.']) : ((_Utils_cmp(
              $elm$core$String$length(form.password),
              $author$project$Viewer$minPasswordChars) < 0) ? _List_fromArray(
              [
                'password must be at least ' + ($elm$core$String$fromInt($author$project$Viewer$minPasswordChars) + ' characters long.')
              ]) : _List_Nil);
        }
      }());
  });
    `,
      `;;;;;IASI;MAAA;MAAS;;QACL;;YAEQ,iDACI;8CAGA;;YAGJ,8CACI;2CAGA;;YAGJ,iDACI;+CAEI;;8DACJ;;;mBAGA`,
    );
  });

  it("mapping with basic if else expr", async () => {
    await testSourceMap(
      `
module Main exposing (..)

viewPagination : (Int -> msg) -> Int -> Model -> Html msg
viewPagination toMsg page (Model feed) =
    let
        viewPageLink currentPage =
            pageLink toMsg currentPage (currentPage == page)

        totalPages =
            PaginatedList.total feed.articles
    in
    if totalPages > 1 then
        List.range 1 totalPages
            |> List.map viewPageLink
            |> ul [ class "pagination" ]

    else
        Html.text ""
    `,
      `
var $author$project$Main$viewPagination = F3(
  function (toMsg, page, _v0) {
    var feed = _v0.a;
    var viewPageLink = function (currentPage) {
      return A3(
        $author$project$Article$Feed$pageLink,
        toMsg,
        currentPage,
        _Utils_eq(currentPage, page));
    };
    var totalPages = $author$project$PaginatedList$total(feed.articles);
    return (totalPages > 1) ? A2(
      $elm$html$Html$ul,
      _List_fromArray(
        [
          $elm$html$Html$Attributes$class('pagination')
        ]),
      A2(
        $elm$core$List$map,
        viewPageLink,
        A2($elm$core$List$range, 1, totalPages))) : $elm$html$Html$text('');
  });
    `,
      `;;;;;IAII;MAEQ;;;;;;qBAGA;IAER,0BACI;MAEO;MAAG;;;;;QADH;QAAS;WADhB,sBAAW,GAAE,gBAKb`,
    );
  });

  it("mapping with pipelines", async () => {
    await testSourceMap(
      `
module Main exposing (..)

view : Model -> Html Msg
view model =
  "string"
    |> String.append "more"
    |> String.append "more"
    |> (\\s -> div [] [ text s ])
    `,
      `
var $author$project$Main$view = function (model) {
  return function (s) {
    return A2(
      $elm$html$Html$div,
      _List_Nil,
      _List_fromArray(
        [
          $elm$html$Html$text(s)
        ]));
  }(
    A2(
      $elm$core$String$append,
      'more',
      A2($elm$core$String$append, 'more', 'stirng')));
};
    `,
      `;;;EAIE;IAGY;;;;;;;;;MADP;MAAc;SADd,yBAAc`,
    );
  });

  it("mapping tuple case expr", async () => {
    await testSourceMap(
      `
module Main exposing (..)

type Maybe a = Just a | Nothing

func a b c d =
    case ( a, b ) of
        ( Just x, "String" ) ->
            case ( c, d ) of
                ( Just _, Just z ) ->
                    z

                ( Just y, Nothing ) ->
                    y

                _ ->
                    x

        ( Nothing, "" ) ->
            "Nothing"

        _ ->
            ""
    `,
      `
var $author$project$Main$func = F4(
  function (a, b, c, d) {
    var _v0 = _Utils_Tuple2(a, b);
    _v0$2:
    while (true) {
      if (_v0.a.$ === 'Just') {
        if (_v0.b === 'String') {
          var x = _v0.a.a;
          var _v1 = _Utils_Tuple2(c, d);
          if (_v1.a.$ === 'Just') {
            if (_v1.b.$ === 'Just') {
              var z = _v1.b.a;
              return z;
            } else {
              var y = _v1.a.a;
              var _v2 = _v1.b;
              return y;
            }
          } else {
            return x;
          }
        } else {
          break _v0$2;
        }
      } else {
        if (_v0.b === '') {
          var _v3 = _v0.a;
          return 'Nothing';
        } else {
          break _v0$2;
        }
      }
    }
    return '';
  });
    `,
      `;;;;IAKI;;;;;;UAEQ;;;;cAEQ;;;;cAGA;;;YAGA;;;;;;;;UAGR;;;;;;IAGA`,
    );
  });

  it("complex case expr", async () => {
    await testSourceMap(
      `
module Main exposing (..)

type RemoteData e a
    = NotAsked
    | Loading
    | Failure e
    | Success a

andMap : RemoteData e a -> RemoteData e (a -> b) -> RemoteData e b
andMap wrappedValue wrappedFunction =
    case ( wrappedFunction, wrappedValue ) of
        ( Success f, Success value ) ->
            Success (f value)

        ( Failure error, _ ) ->
            Failure error

        ( _, Failure error ) ->
            Failure error

        ( Loading, _ ) ->
            Loading

        ( _, Loading ) ->
            Loading

        ( NotAsked, _ ) ->
            NotAsked

        ( _, NotAsked ) ->
            NotAsked
        `,
      `
var $author$project$Main$andMap = F2(
  function (wrappedValue, wrappedFunction) {
    var _v0 = _Utils_Tuple2(wrappedFunction, wrappedValue);
    _v0$2:
    while (true) {
      _v0$3:
      while (true) {
        _v0$4:
        while (true) {
          _v0$5:
          while (true) {
            switch (_v0.a.$) {
              case 'Success':
                switch (_v0.b.$) {
                  case 'Success':
                    var f = _v0.a.a;
                    var value = _v0.b.a;
                    return $krisajenkins$remotedata$RemoteData$Success(
                      f(value));
                  case 'Failure':
                    break _v0$2;
                  case 'Loading':
                    break _v0$4;
                  default:
                    var _v4 = _v0.b;
                    return $krisajenkins$remotedata$RemoteData$NotAsked;
                }
              case 'Failure':
                var error = _v0.a.a;
                return $krisajenkins$remotedata$RemoteData$Failure(error);
              case 'Loading':
                switch (_v0.b.$) {
                  case 'Failure':
                    break _v0$2;
                  case 'Loading':
                    break _v0$3;
                  case 'NotAsked':
                    break _v0$3;
                  default:
                    break _v0$3;
                }
              default:
                switch (_v0.b.$) {
                  case 'Failure':
                    break _v0$2;
                  case 'Loading':
                    break _v0$4;
                  case 'NotAsked':
                    break _v0$5;
                  default:
                    break _v0$5;
                }
            }
          }
          var _v3 = _v0.a;
          return $krisajenkins$remotedata$RemoteData$NotAsked;
        }
        var _v2 = _v0.b;
        return $krisajenkins$remotedata$RemoteData$Loading;
      }
      var _v1 = _v0.a;
      return $krisajenkins$remotedata$RemoteData$Loading;
    }
    var error = _v0.b.a;
    return $krisajenkins$remotedata$RemoteData$Failure(error);
  });
        `,
      `;;;;IAUI;;;;;;;;;;;;;;;oBAEQ;;;;;;;;oBAkBA;;;;gBAfA;;;;;;;;;;;;;;;;;;;;;;;;;;UAYA;;;QAHA;;;MAHA;;;IAHA`,
    );
  });

  it("complex expr", async () => {
    await testSourceMap(
      `
module Main exposing (..)

type Edit
    = Replace Id Mark.New.Block
      -- Create an element in a ManyOf
      -- Indexes overflow, so if it's too large, it just puts it at the end.
      -- Indexes that are below 0 and clamped to 0
    | InsertAt Id Int Mark.New.Block
    | Delete Id Int
      -- Text Editing
    | StyleText Id Offset Offset Restyle
    | Annotate Id Offset Offset Annotation
    | ReplaceSelection Id Offset Offset (List Mark.New.Text)

type Description
    = DescribeBlock
        { id : Id
        , name : String
        , found : Found Description
        , expected : Expectation
        }
    | Record
        { id : Id
        , name : String
        , found : Found (List ( String, Found Description ))
        , expected : Expectation
        }
    | OneOf
        { id : Id
        , choices : List Expectation
        , child : Found Description
        }
    | ManyOf
        { id : Id
        , range : Range
        , choices : List Expectation
        , children : List (Found Description)
        }
    | StartsWith
        { range : Range
        , id : Id
        , first :
            { found : Description
            , expected : Expectation
            }
        , second :
            { found : Description
            , expected : Expectation
            }
        }
    | DescribeTree
        { id : Id
        , range : Range
        , children : List (Nested Description)
        , expected : Expectation
        }
      -- Primitives
    | DescribeBoolean
        { id : Id
        , found : Found Bool
        }
    | DescribeInteger
        { id : Id
        , found : Found Int
        }
    | DescribeFloat
        { id : Id
        , found : Found ( String, Float )
        }
    | DescribeText
        { id : Id
        , range : Range
        , text : List TextDescription
        }
    | DescribeString Id Range String
    | DescribeNothing Id

update : Document data -> Edit -> Parsed -> Result (List Mark.Error.Error) Parsed
update doc edit (Parsed original) =
    let
        editFn =
            case edit of
                Replace id new ->
                    editAtId id <|
                        \\i pos desc ->
                            -- if Desc.match desc new then
                            replaceOption id i pos original new desc

                InsertAt id index new ->
                    editAtId id <|
                        \\indentation pos desc ->
                            case desc of
                                ManyOf many ->
                                    if List.any (matchExpected new) many.choices then
                                        let
                                            inserted =
                                                makeInsertAt
                                                    original.currentSeed
                                                    index
                                                    indentation
                                                    many
                                                    new
                                        in
                                        EditMade
                                            (Just inserted.seed)
                                            inserted.push
                                            (ManyOf
                                                { many
                                                    | children =
                                                        inserted.updated
                                                }
                                            )

                                    else
                                        ErrorMakingEdit
                                            (Error.DocumentDoesntAllow
                                                (Desc.humanReadableExpectations new)
                                                (List.map Desc.humanReadableExpectations many.choices)
                                            )

                                _ ->
                                    -- inserts= by index only works for \`manyOf\`
                                    ErrorMakingEdit Error.InvalidInsert

                Delete id index ->
                    editAtId id
                        (makeDeleteBlock id index)

                StyleText id start end restyleAction ->
                    editAtId id
                        (\\indent pos desc ->
                            case desc of
                                DescribeText details ->
                                    let
                                        newTexts =
                                            details.text
                                                |> List.foldl
                                                    (doTextEdit start
                                                        end
                                                        (List.map (applyStyles restyleAction))
                                                    )
                                                    emptySelectionEdit
                                                |> .elements
                                                |> List.foldl mergeStyles []
                                    in
                                    EditMade
                                        Nothing
                                        (Just (pushNewTexts details.text newTexts))
                                        (DescribeText
                                            { details | text = newTexts }
                                        )

                                _ ->
                                    ErrorMakingEdit Error.InvalidTextEdit
                        )

                Annotate id start end wrapper ->
                    editAtId id
                        (\\indent pos desc ->
                            case desc of
                                DescribeText details ->
                                    let
                                        newTexts =
                                            details.text
                                                |> List.foldl
                                                    (doTextEdit start
                                                        end
                                                        (\\els ->
                                                            let
                                                                textStart =
                                                                    getTextStart els
                                                                        |> Maybe.withDefault pos

                                                                wrapped =
                                                                    case wrapper of
                                                                        Annotation name attrs ->
                                                                            ExpectInlineBlock
                                                                                { name = name
                                                                                , kind =
                                                                                    SelectText
                                                                                        (List.concatMap onlyText els)
                                                                                , fields = attrs
                                                                                }

                                                                        Verbatim name attrs ->
                                                                            ExpectInlineBlock
                                                                                { name = name
                                                                                , kind =
                                                                                    SelectString
                                                                                        (List.concatMap onlyText els
                                                                                            |> List.map textString
                                                                                            |> String.join ""
                                                                                        )
                                                                                , fields = attrs
                                                                                }

                                                                ( end_, newText ) =
                                                                    createInline
                                                                        textStart
                                                                        [ wrapped ]
                                                            in
                                                            newText
                                                        )
                                                    )
                                                    emptySelectionEdit
                                                |> .elements
                                                |> List.foldl mergeStyles []
                                    in
                                    EditMade
                                        Nothing
                                        (Just (pushNewTexts details.text newTexts))
                                        (DescribeText { details | text = newTexts })

                                _ ->
                                    ErrorMakingEdit Error.InvalidTextEdit
                        )

                ReplaceSelection id start end newTextEls ->
                    editAtId id
                        (\\indent pos desc ->
                            case desc of
                                DescribeText details ->
                                    let
                                        makeNewText selectedEls =
                                            newTextEls
                                                |> createInline (Maybe.withDefault pos (getTextStart selectedEls))
                                                |> Tuple.second

                                        newTexts =
                                            details.text
                                                |> List.foldl
                                                    (doTextEdit start
                                                        end
                                                        makeNewText
                                                    )
                                                    emptySelectionEdit
                                                |> .elements
                                                |> List.foldl mergeStyles []
                                    in
                                    EditMade
                                        Nothing
                                        (Just (pushNewTexts details.text newTexts))
                                        (DescribeText { details | text = newTexts })

                                _ ->
                                    ErrorMakingEdit Error.InvalidTextEdit
                        )
    in
    original.found
        |> makeFoundEdit
            { makeEdit = editFn
            , indentation = 0
            }
        |> prepareResults doc original
        `,
      `
var $author$project$Main$update = F3(
  function (doc, edit, _v0) {
    var original = _v0.a;
    var editFn = function () {
      switch (edit.$) {
        case 'Replace':
          var id = edit.a;
          var _new = edit.b;
          return A2(
            $author$project$Mark$Edit$editAtId,
            id,
            F3(
              function (i, pos, desc) {
                return A6($author$project$Mark$Edit$replaceOption, id, i, pos, original, _new, desc);
              }));
        case 'InsertAt':
          var id = edit.a;
          var index = edit.b;
          var _new = edit.c;
          return A2(
            $author$project$Mark$Edit$editAtId,
            id,
            F3(
              function (indentation, pos, desc) {
                if (desc.$ === 'ManyOf') {
                  var many = desc.a;
                  if (A2(
                    $elm$core$List$any,
                    $author$project$Mark$Internal$Description$matchExpected(_new),
                    many.choices)) {
                    var inserted = A5($author$project$Mark$Edit$makeInsertAt, original.currentSeed, index, indentation, many, _new);
                    return A3(
                      $author$project$Mark$Edit$EditMade,
                      $elm$core$Maybe$Just(inserted.seed),
                      inserted.push,
                      $author$project$Mark$Internal$Description$ManyOf(
                        _Utils_update(
                          many,
                          {children: inserted.updated})));
                  } else {
                    return $author$project$Mark$Edit$ErrorMakingEdit(
                      A2(
                        $author$project$Mark$Internal$Error$DocumentDoesntAllow,
                        $author$project$Mark$Internal$Description$humanReadableExpectations(_new),
                        A2($elm$core$List$map, $author$project$Mark$Internal$Description$humanReadableExpectations, many.choices)));
                  }
                } else {
                  return $author$project$Mark$Edit$ErrorMakingEdit($author$project$Mark$Internal$Error$InvalidInsert);
                }
              }));
        case 'Delete':
          var id = edit.a;
          var index = edit.b;
          return A2(
            $author$project$Mark$Edit$editAtId,
            id,
            A2($author$project$Mark$Edit$makeDeleteBlock, id, index));
        case 'StyleText':
          var id = edit.a;
          var start = edit.b;
          var end = edit.c;
          var restyleAction = edit.d;
          return A2(
            $author$project$Mark$Edit$editAtId,
            id,
            F3(
              function (indent, pos, desc) {
                if (desc.$ === 'DescribeText') {
                  var details = desc.a;
                  var newTexts = A3(
                    $elm$core$List$foldl,
                    $author$project$Mark$Edit$mergeStyles,
                    _List_Nil,
                    A3(
                      $elm$core$List$foldl,
                      A3(
                        $author$project$Mark$Edit$doTextEdit,
                        start,
                        end,
                        $elm$core$List$map(
                          $author$project$Mark$Edit$applyStyles(restyleAction))),
                      $author$project$Mark$Edit$emptySelectionEdit,
                      details.text).elements);
                  return A3(
                    $author$project$Mark$Edit$EditMade,
                    $elm$core$Maybe$Nothing,
                    $elm$core$Maybe$Just(
                      A2($author$project$Mark$Edit$pushNewTexts, details.text, newTexts)),
                    $author$project$Mark$Internal$Description$DescribeText(
                      _Utils_update(
                        details,
                        {text: newTexts})));
                } else {
                  return $author$project$Mark$Edit$ErrorMakingEdit($author$project$Mark$Internal$Error$InvalidTextEdit);
                }
              }));
        case 'Annotate':
          var id = edit.a;
          var start = edit.b;
          var end = edit.c;
          var wrapper = edit.d;
          return A2(
            $author$project$Mark$Edit$editAtId,
            id,
            F3(
              function (indent, pos, desc) {
                if (desc.$ === 'DescribeText') {
                  var details = desc.a;
                  var newTexts = A3(
                    $elm$core$List$foldl,
                    $author$project$Mark$Edit$mergeStyles,
                    _List_Nil,
                    A3(
                      $elm$core$List$foldl,
                      A3(
                        $author$project$Mark$Edit$doTextEdit,
                        start,
                        end,
                        function (els) {
                          var wrapped = function () {
                            if (wrapper.$ === 'Annotation') {
                              var name = wrapper.a;
                              var attrs = wrapper.b;
                              return $author$project$Mark$Internal$Description$ExpectInlineBlock(
                                {
                                  fields: attrs,
                                  kind: $author$project$Mark$Internal$Description$SelectText(
                                    A2($elm$core$List$concatMap, $author$project$Mark$Edit$onlyText, els)),
                                  name: name
                                });
                            } else {
                              var name = wrapper.a;
                              var attrs = wrapper.b;
                              return $author$project$Mark$Internal$Description$ExpectInlineBlock(
                                {
                                  fields: attrs,
                                  kind: $author$project$Mark$Internal$Description$SelectString(
                                    A2(
                                      $elm$core$String$join,
                                      '',
                                      A2(
                                        $elm$core$List$map,
                                        $author$project$Mark$Edit$textString,
                                        A2($elm$core$List$concatMap, $author$project$Mark$Edit$onlyText, els)))),
                                  name: name
                                });
                            }
                          }();
                          var textStart = A2(
                            $elm$core$Maybe$withDefault,
                            pos,
                            $author$project$Mark$Edit$getTextStart(els));
                          var _v5 = A2(
                            $author$project$Mark$Internal$Description$createInline,
                            textStart,
                            _List_fromArray(
                              [wrapped]));
                          var end_ = _v5.a;
                          var newText = _v5.b;
                          return newText;
                        }),
                      $author$project$Mark$Edit$emptySelectionEdit,
                      details.text).elements);
                  return A3(
                    $author$project$Mark$Edit$EditMade,
                    $elm$core$Maybe$Nothing,
                    $elm$core$Maybe$Just(
                      A2($author$project$Mark$Edit$pushNewTexts, details.text, newTexts)),
                    $author$project$Mark$Internal$Description$DescribeText(
                      _Utils_update(
                        details,
                        {text: newTexts})));
                } else {
                  return $author$project$Mark$Edit$ErrorMakingEdit($author$project$Mark$Internal$Error$InvalidTextEdit);
                }
              }));
        default:
          var id = edit.a;
          var start = edit.b;
          var end = edit.c;
          var newTextEls = edit.d;
          return A2(
            $author$project$Mark$Edit$editAtId,
            id,
            F3(
              function (indent, pos, desc) {
                if (desc.$ === 'DescribeText') {
                  var details = desc.a;
                  var makeNewText = function (selectedEls) {
                    return A2(
                      $author$project$Mark$Internal$Description$createInline,
                      A2(
                        $elm$core$Maybe$withDefault,
                        pos,
                        $author$project$Mark$Edit$getTextStart(selectedEls)),
                      newTextEls).b;
                  };
                  var newTexts = A3(
                    $elm$core$List$foldl,
                    $author$project$Mark$Edit$mergeStyles,
                    _List_Nil,
                    A3(
                      $elm$core$List$foldl,
                      A3($author$project$Mark$Edit$doTextEdit, start, end, makeNewText),
                      $author$project$Mark$Edit$emptySelectionEdit,
                      details.text).elements);
                  return A3(
                    $author$project$Mark$Edit$EditMade,
                    $elm$core$Maybe$Nothing,
                    $elm$core$Maybe$Just(
                      A2($author$project$Mark$Edit$pushNewTexts, details.text, newTexts)),
                    $author$project$Mark$Internal$Description$DescribeText(
                      _Utils_update(
                        details,
                        {text: newTexts})));
                } else {
                  return $author$project$Mark$Edit$ErrorMakingEdit($author$project$Mark$Internal$Error$InvalidTextEdit);
                }
              }));
      }
    }();
    return A3(
      $author$project$Mark$Edit$prepareResults,
      doc,
      original,
      A2(
        $author$project$Mark$Edit$makeFoundEdit,
        {indentation: 0, makeEdit: editFn},
        original.found));
  });
        `,
      ``,
      true,
    );
  });
});
