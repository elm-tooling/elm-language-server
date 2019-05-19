import { Tree } from "tree-sitter";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  IConnection,
  InsertTextFormat,
  MarkupKind,
  SymbolKind,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { getSpecialItems } from "../util/elmUtils";
import { HintHelper } from "../util/hintHelper";
import { TreeUtils } from "../util/treeUtils";

export class CompletionProvider {
  private connection: IConnection;
  private forest: IForest;
  private imports: IImports;

  constructor(connection: IConnection, forest: IForest, imports: IImports) {
    this.connection = connection;
    this.forest = forest;
    this.imports = imports;

    this.connection.onCompletion(this.handleCompletionRequest);
  }

  private handleCompletionRequest = (
    param: CompletionParams,
  ): CompletionItem[] | null | undefined => {
    const completions: CompletionItem[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      // Todo add variables from local let scopes
      completions.push(...this.getSameFileTopLevelCompletions(tree));

      completions.push(
        ...this.getCompletionsFromOtherFile(param.textDocument.uri),
      );

      completions.push(...this.createSnippets());

      return completions;
    }
  };

  private getCompletionsFromOtherFile(uri: string): CompletionItem[] {
    const completions: CompletionItem[] = [];

    if (this.imports.imports && this.imports.imports[uri]) {
      const importList = this.imports.imports[uri];
      importList.forEach(element => {
        const value = HintHelper.createHint(element.node);
        switch (element.type) {
          case "Function":
            completions.push(
              this.createFunctionCompletion(value, element.alias),
            );
            break;
          case "UnionConstructor":
            completions.push(
              this.createUnionConstructorCompletion(element.alias),
            );
            break;
          case "Operator":
            completions.push(
              this.createOperatorCompletion(value, element.alias),
            );
            break;
          case "Type":
            completions.push(this.createTypeCompletion(value, element.alias));
            break;
          case "TypeAlias":
            completions.push(
              this.createTypeAliasCompletion(value, element.alias),
            );
            break;
          // Do not handle operators, they are not valid if prefixed
        }
      });
    }

    completions.push(
      ...getSpecialItems().map(a =>
        this.createCompletion(a.markdown, a.symbolKind, a.name),
      ),
    );

    return completions;
  }

  private getSameFileTopLevelCompletions(tree: Tree): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const functions = TreeUtils.findAllFunctions(tree);
    // Add functions
    if (functions) {
      const declarations = functions.filter(
        a =>
          a.firstNamedChild !== null &&
          a.firstNamedChild.type === "function_declaration_left" &&
          a.firstNamedChild.firstNamedChild !== null &&
          a.firstNamedChild.firstNamedChild.type === "lower_case_identifier",
      );
      for (const declaration of declarations) {
        const value = HintHelper.createHint(declaration);
        completions.push(
          this.createFunctionCompletion(
            value,
            declaration.firstNamedChild!.firstNamedChild!.text,
          ),
        );
      }
    }
    // Add types
    const typeDeclarations = TreeUtils.findAllTypeDeclarations(tree);
    if (typeDeclarations) {
      for (const declaration of typeDeclarations) {
        const value = HintHelper.createHint(declaration);
        const name = TreeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          declaration,
        );
        if (name) {
          completions.push(this.createTypeCompletion(value, name.text));
        }
        // Add types constuctors
        const unionVariants = declaration.descendantsOfType("union_variant");
        for (const unionVariant of unionVariants) {
          const unionVariantName = TreeUtils.findFirstNamedChildOfType(
            "upper_case_identifier",
            unionVariant,
          );
          if (unionVariantName) {
            completions.push(
              this.createUnionConstructorCompletion(unionVariantName.text),
            );
          }
        }
      }
    }
    // Add alias types
    const typeAliasDeclarations = TreeUtils.findAllTypeAliasDeclarations(tree);
    if (typeAliasDeclarations) {
      for (const declaration of typeAliasDeclarations) {
        const value = HintHelper.createHint(declaration);
        const name = TreeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          declaration,
        );
        if (name) {
          completions.push(this.createTypeAliasCompletion(value, name.text));
        }
      }
    }

    return completions;
  }

  private createFunctionCompletion(
    markdownDocumentation: string | undefined,
    label: string,
  ): CompletionItem {
    return this.createCompletion(
      markdownDocumentation,
      SymbolKind.Function,
      label,
    );
  }

  private createTypeCompletion(
    markdownDocumentation: string | undefined,
    label: string,
  ): CompletionItem {
    return this.createCompletion(markdownDocumentation, SymbolKind.Enum, label);
  }

  private createTypeAliasCompletion(
    markdownDocumentation: string | undefined,
    label: string,
  ): CompletionItem {
    return this.createCompletion(
      markdownDocumentation,
      SymbolKind.Struct,
      label,
    );
  }

  private createOperatorCompletion(
    markdownDocumentation: string | undefined,
    label: string,
  ): CompletionItem {
    return this.createCompletion(
      markdownDocumentation,
      SymbolKind.Operator,
      label,
    );
  }

  private createUnionConstructorCompletion(label: string): CompletionItem {
    return this.createCompletion(undefined, SymbolKind.EnumMember, label);
  }

  private createCompletion(
    markdownDocumentation: string | undefined,
    kind: CompletionItemKind,
    label: string,
  ): CompletionItem {
    return {
      documentation: {
        kind: MarkupKind.Markdown,
        value: markdownDocumentation ? markdownDocumentation : "",
      },
      kind,
      label,
    };
  }

  private createSnippet(
    label: string,
    snippetText: string | string[],
    markdownDocumentation: string | undefined,
  ): CompletionItem {
    return {
      documentation: {
        kind: MarkupKind.Markdown,
        value: markdownDocumentation ? markdownDocumentation : "",
      },
      insertText:
        snippetText instanceof Array ? snippetText.join("\n") : snippetText,
      insertTextFormat: InsertTextFormat.Snippet,
      kind: CompletionItemKind.Snippet,
      label,
    };
  }

  private createSnippets() {
    return [
      this.createSnippet("negate", "negate ${1:number}", "number -> number"),

      this.createSnippet("turns", "turns ${1:float}", "Float -> Float"),
      this.createSnippet("always", "always ${1:a} ${2:b}", "a -> b -> a"),
      this.createSnippet(
        "logBase",
        "logBase ${1:float} ${2:float}",
        "Float -> Float -> Float",
      ),
      this.createSnippet("truncate", "truncate ${1:float}", "Float -> Int"),
      this.createSnippet(
        "clamp",
        "clamp ${1:number} ${2:number} ${3:number}",
        "number -> number -> number -> number",
      ),
      this.createSnippet(
        "compare",
        "compare ${1:comparable} ${2:comparable}",
        "comparable -> comparable -> Order",
      ),
      this.createSnippet(
        "curry",
        "curry ${1:function} ${2:a} ${3:b}",
        "((a,b) -> c) -> a -> b -> c",
      ),
      this.createSnippet(
        "flip",
        "flip ${1:function} ${2:function}",
        "(a -> b -> c) -> (b -> a -> c)",
      ),
      this.createSnippet(
        "toPolar",
        "toPolar ${1:tuple}",
        "(Float,Float) -> (Float,Float)",
      ),
      this.createSnippet("first", "first ${1:tuple}", "(a,b) -> a"),
      this.createSnippet("identity", "identity ${1:a}", "a -> a"),
      this.createSnippet("isNaN", "isNaN ${1:float}", "Float -> Bool"),
      this.createSnippet(
        "min",
        "min ${1:comparable} ${2:comparable}",
        "comparable -> comparable -> comparable",
      ),
      this.createSnippet("not", "not ${1:bool}", "Bool -> Bool"),
      this.createSnippet("rem", "rem ${1:int} ${2:int}", "Int -> Int -> Int"),
      this.createSnippet("second", "second ${1:tuple}", "(a,b) -> b"),
      this.createSnippet("toFloat", "toFloat ${1:int}", "Int -> Float"),
      this.createSnippet("toString", "toString ${1:a}", "a -> String"),
      this.createSnippet(
        "uncurry",
        "uncurry ${1:function} ${2:tuple}",
        "(a -> b -> c) -> (a,b) -> c",
      ),
      this.createSnippet(
        "xor",
        "xor ${1:bool} ${2:bool}",
        "Bool -> Bool -> Bool",
      ),
      this.createSnippet(
        "module",
        "module ${1:Name} exposing (${2:..})",
        "Module definition",
      ),
      this.createSnippet(
        "import",
        "import ${1:Name} exposing (${2:..})",
        "Unqualified import",
      ),
      this.createSnippet(
        "caseof",
        [
          "case ${1:expression} of",
          "    ${2:option1} ->",
          "        ${3}",
          "",
          "    ${4:option2} ->",
          "        ${5}",
        ],
        "Case of expression with 2 alternatives",
      ),
      this.createSnippet("comment", ["{-", "${0}", "-}"], "Multi-line comment"),
      this.createSnippet(
        "record",
        [
          "${1:recordName} =",
          "    { ${2:key1} = ${3:value1}",
          "    , ${4:key2} = ${5:value2}",
          "    }",
        ],
        "Record",
      ),
      this.createSnippet(
        "recordtype",
        [
          "type alias ${1:recordName} =",
          "    { ${2:key1} : ${3:ValueType1}",
          "    , ${4:key2} : ${5:ValueType2}",
          "    }",
        ],
        "Record type",
      ),
      this.createSnippet(
        "recordupdate",
        ["{ ${1:recordName} | ${2:key} = ${3} }"],
        "Update record",
      ),
      this.createSnippet(
        "anonymous",
        ["\\ ${1:argument} -> ${1:argument}"],
        "Anonymous function",
      ),
      this.createSnippet(
        "union",
        ["type ${1:Typename}", "    = ${2:Value1}", "    | ${3:Value2}"],
        "Union type",
      ),
      this.createSnippet(
        "msg",
        ["type Msg", "    = ${1:Message}", "    | ${2:Message}"],
        "Default message union type",
      ),
      this.createSnippet(
        "func",
        [
          "${1:functionName} : ${2:ArgumentType} -> ${3:ReturnType}",
          "${1:functionName} ${4:arguments} =",
          "    ${5}",
        ],
        "Function with type annotation",
      ),
      this.createSnippet(
        "letin",
        ["let", "    ${1}", "in", "${0}"],
        "Let expression",
      ),
      this.createSnippet(
        "update",
        [
          "update : Msg -> Model -> ${1|Model, ( Model\\, Cmd Msg )|}",
          "update msg model =",
          "    case msg of",
          "        ${2:option1} ->",
          "            ${1|Model, ( Model\\, Cmd Msg )|}",
          "",
          "        ${3:option2} ->",
          "            ${1|Model, ( Model\\, Cmd Msg )|}",
        ],
        "Default update function",
      ),
      this.createSnippet(
        "view",
        ["view : Model -> Html Msg", "view model =", "    ${0}"],
        "Default view function",
      ),
      this.createSnippet(
        "portin",
        ["port ${1:portName} : (${2:Typename} -> msg) -> Sub msg"],
        "Incoming port",
      ),
      this.createSnippet(
        "portout",
        ["port ${1:portName} : ${2:Typename} -> Cmd msg"],
        "Outgoing port",
      ),
      this.createSnippet(
        "mainsandbox",
        [
          "main : Program () Model Msg",
          "main =",
          "    Browser.sandbox",
          "        { init = init",
          "        , view = view",
          "        , update = update",
          "        }",
        ],
        "Main Browser Sandbox",
      ),
      this.createSnippet(
        "mainelement",
        [
          "main : Program () Model Msg",
          "main =",
          "    Browser.element",
          "        { init = init",
          "        , view = view",
          "        , update = update",
          "        , subscriptions = subscriptions",
          "        }",
        ],
        "Main Browser Element",
      ),
      this.createSnippet(
        "maindocument",
        [
          "main : Program () Model Msg",
          "main =",
          "    Browser.document",
          "        { init = init",
          "        , view = view",
          "        , update = update",
          "        , subscriptions = subscriptions",
          "        }",
        ],
        "Main Browser Document",
      ),
      this.createSnippet(
        "mainapplication",
        [
          "main : Program () Model Msg",
          "main =",
          "    Browser.application",
          "        { init = init",
          "        , view = view",
          "        , update = update",
          "        , subscriptions = subscriptions",
          "        , onUrlChange = onUrlChange",
          "        , onUrlRequest = onUrlRequest",
          "        }",
        ],
        "Main Browser Application",
      ),
      this.createSnippet(
        "subscriptions",
        [
          "subscriptions : Model -> Sub Msg",
          "subscriptions model =",
          "    Sub.none",
        ],
        "Subscriptions",
      ),
      this.createSnippet(
        "elmdmodel",
        [
          "type alias Model =",
          "    { statusText : String",
          "    }",
          "",
          "",
          "model : Model",
          "model =",
          '    { statusText = "Ready"',
          "    }",
        ],
        "A default model with type declaration",
      ),
      this.createSnippet(
        "Browser.sandbox",
        [
          "module Main exposing (Model, Msg, update, view, subscriptions, init)",
          "",
          "import Html exposing (..)",
          "import Browser",
          "",
          "",
          "main : Program () Model Msg",
          "main =",
          "    Browser.sandbox",
          "        { init = init",
          "        , view = view",
          "        , update = update",
          "    }",
          "",
          "",
          "type alias Model =",
          "    { ${1:property} : ${2:propertyType}",
          "    }",
          "",
          "",
          "init : Model",
          "init =",
          "    Model ${3:modelInitialValue}",
          "",
          "",
          "type Msg",
          "    = ${4:Msg1}",
          "    | ${5:Msg2}",
          "",
          "",
          "update : Msg -> Model -> Model",
          "update msg model =",
          "    case msg of",
          "        ${6:Msg1} ->",
          "            model",
          "",
          "        ${7:Msg2} ->",
          "            model",
          "",
          "",
          "view : Model -> Html Msg",
          "view model =",
          "    div []",
          '        [ text "New Sandbox" ]',
          "",
          "",
          "${0}",
        ],
        "Browser Sandbox",
      ),
      this.createSnippet(
        "Browser.element",
        [
          "module Main exposing (Model, Msg, update, view, subscriptions, init)",
          "",
          "import Html exposing (..)",
          "import Browser",
          "",
          "",
          "main : Program flags Model Msg",
          "main =",
          "    Browser.element",
          "        { init = init",
          "        , view = view",
          "        , update = update",
          "        , subscriptions = subscriptions",
          "    }",
          "",
          "",
          "type alias Model =",
          "    { key : Nav.Key",
          "    , url : Url.Url",
          "    , property : propertyType",
          "    }",
          "",
          "",
          "init : flags -> (Model, Cmd Msg)",
          "init flags =",
          "    (Model modelInitialValue, Cmd.none)",
          "",
          "",
          "type Msg",
          "    = ${1:Msg1}",
          "    | ${2:Msg2}",
          "",
          "",
          "update : Msg -> Model -> (Model, Cmd Msg)",
          "update msg model =",
          "    case msg of",
          "        ${1:Msg1} ->",
          "            (model, Cmd.none)",
          "",
          "        ${2:Msg2} ->",
          "            (model, Cmd.none)",
          "",
          "",
          "subscriptions : Model -> Sub Msg",
          "subscriptions model =",
          "    Sub.none",
          "",
          "",
          "view : Model -> Html Msg",
          "view model =",
          "    div []",
          '        [ text "New Element" ]',
          "",
          "",
          "${0}",
        ],
        "Browser Element",
      ),
      this.createSnippet(
        "Browser.document",
        [
          "module Main exposing (Model, Msg, update, view, subscriptions, init)",
          "",
          "import Html exposing (..)",
          "import Browser",
          "",
          "",
          "main : Program flags Model Msg",
          "main =",
          "    Browser.document",
          "        { init = init",
          "        , view = view",
          "        , update = update",
          "        , subscriptions = subscriptions",
          "    }",
          "",
          "",
          "type alias Model =",
          "    { property : propertyType",
          "    }",
          "",
          "",
          "init : flags -> (Model, Cmd Msg)",
          "init flags =",
          "    (Model modelInitialValue, Cmd.none)",
          "",
          "",
          "type Msg",
          "    = ${1:Msg1}",
          "    | ${2:Msg2}",
          "",
          "",
          "update : Msg -> Model -> (Model, Cmd Msg)",
          "update msg model =",
          "    case msg of",
          "        ${1:Msg1} ->",
          "            (model, Cmd.none)",
          "",
          "        ${2:Msg2} ->",
          "            (model, Cmd.none)",
          "",
          "",
          "subscriptions : Model -> Sub Msg",
          "subscriptions model =",
          "    Sub.none",
          "",
          "",
          "view : Model -> Browser.Document Msg",
          "view model =",
          '    { title = "Document Title"',
          "    , body =",
          "        [ div []",
          '            [ text "New Document" ]',
          "      ]",
          "    }",
          "",
          "",
          "${0}",
        ],
        "Browser Document",
      ),
      this.createSnippet(
        "Browser.application",
        [
          "module Main exposing (Model, init, Msg, update, view, subscriptions)",
          "",
          "import Html exposing (..)",
          "import Browser",
          "import Browser.Navigation as Nav",
          "import Url",
          "",
          "",
          "main : Program flags Model Msg",
          "main =",
          "    Browser.application",
          "        { init = init",
          "        , view = view",
          "        , update = update",
          "        , subscriptions = subscriptions",
          "        , onUrlRequest = UrlRequested",
          "        , onUrlChange = UrlChanged",
          "    }",
          "",
          "",
          "type alias Model =",
          "    { key : Nav.Key",
          "    , url : Url.Url",
          "    , property : propertyType",
          "    }",
          "",
          "",
          "init : flags -> Url.Url -> Nav.Key -> (Model, Cmd Msg)",
          "init flags url key =",
          "    (Model modelInitialValue, Cmd.none)",
          "",
          "",
          "type Msg",
          "    = ${1:Msg1}",
          "    | ${2:Msg2}",
          "    | UrlRequested Browser.UrlRequest",
          "    | UrlChanged Url.Url",
          "",
          "",
          "update : Msg -> Model -> (Model, Cmd Msg)",
          "update msg model =",
          "    case msg of",
          "        ${1:Msg1} ->",
          "            (model, Cmd.none)",
          "",
          "        ${2:Msg2} ->",
          "            (model, Cmd.none)",
          "",
          "        UrlRequested urlRequest ->",
          "            case urlRequest of",
          "                Browser.Internal url ->",
          "                    ( model, Nav.pushUrl model.key (Url.toString url) )",
          "",
          "                Browser.External href ->",
          "                    ( model, Nav.load href )",
          "",
          "        UrlChanged url ->",
          "            ( { model | url = url }",
          "            , Cmd.none",
          "            )",
          "",
          "",
          "subscriptions : Model -> Sub Msg",
          "subscriptions model =",
          "    Sub.none",
          "",
          "",
          "view : Model -> Browser.Document Msg",
          "view model =",
          '    { title = "Application Title"',
          "    , body =",
          "        [ div []",
          '            [ text "New Application" ]',
          "      ]",
          "    }",
          "",
          "",
          "${0}",
        ],
        "Browser Application",
      ),
      this.createSnippet(
        "describe",
        ['describe "${1:name}"', "    [ ${0}", "    ]"],
        "describe block in Elm-test",
      ),
      this.createSnippet(
        "test",
        ['test "${1:name}" <|', "    \\_ ->", "        ${0}"],
        "test block in Elm-test",
      ),
      this.createSnippet("todo", "-- TODO: ${0}", "TODO comment"),
    ];
  }
}
