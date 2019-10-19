import {
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  IConnection,
  InsertTextFormat,
  MarkupKind,
  Position,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { getEmptyTypes } from "../util/elmUtils";
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
    params: CompletionParams,
  ): CompletionItem[] | null | undefined => {
    this.connection.console.info(`A completion was requested`);
    const completions: CompletionItem[] = [];

    const tree: Tree | undefined = this.forest.getTree(params.textDocument.uri);

    if (tree) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        tree.rootNode,
        params.position,
      );

      const targetLine = tree.rootNode.text.split("\n")[params.position.line];

      let currentCharacter = params.position.character;
      while (
        currentCharacter - 1 >= 0 &&
        targetLine[currentCharacter - 1] !== " "
      ) {
        currentCharacter--;
      }
      const replaceRange = Range.create(
        Position.create(params.position.line, currentCharacter),
        params.position,
      );
      completions.push(
        ...this.getSameFileTopLevelCompletions(tree, replaceRange),
      );
      completions.push(
        ...this.findDefinitionsForScope(nodeAtPosition, tree, replaceRange),
      );

      completions.push(
        ...this.getCompletionsFromOtherFile(
          params.textDocument.uri,
          replaceRange,
        ),
      );

      completions.push(...this.createSnippets());

      return completions;
    }
  };

  private getCompletionsFromOtherFile(
    uri: string,
    range: Range,
  ): CompletionItem[] {
    const completions: CompletionItem[] = [];

    if (this.imports.imports && this.imports.imports[uri]) {
      const importList = this.imports.imports[uri];
      importList.forEach(element => {
        const value = HintHelper.createHint(element.node);
        switch (element.type) {
          case "Function":
            completions.push(
              this.createFunctionCompletion(value, element.alias, range),
            );
            break;
          case "UnionConstructor":
            completions.push(
              this.createUnionConstructorCompletion(element.alias, range),
            );
            break;
          case "Operator":
            completions.push(
              this.createOperatorCompletion(value, element.alias, range),
            );
            break;
          case "Type":
            completions.push(
              this.createTypeCompletion(value, element.alias, range),
            );
            break;
          case "TypeAlias":
            completions.push(
              this.createTypeAliasCompletion(value, element.alias, range),
            );
            break;
          // Do not handle operators, they are not valid if prefixed
        }
      });
    }

    completions.push(
      ...getEmptyTypes().map(a =>
        this.createCompletion(a.markdown, a.symbolKind, a.name, range),
      ),
    );

    return completions;
  }

  private getSameFileTopLevelCompletions(
    tree: Tree,
    range: Range,
  ): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const topLevelFunctions = TreeUtils.findAllTopLeverFunctionDeclarations(
      tree,
    );
    // Add functions
    if (topLevelFunctions) {
      const declarations = topLevelFunctions.filter(
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
            range,
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
          completions.push(this.createTypeCompletion(value, name.text, range));
        }
        // Add types constructors
        const unionVariants = TreeUtils.descendantsOfType(
          declaration,
          "union_variant",
        );
        for (const unionVariant of unionVariants) {
          const unionVariantName = TreeUtils.findFirstNamedChildOfType(
            "upper_case_identifier",
            unionVariant,
          );
          if (unionVariantName) {
            completions.push(
              this.createUnionConstructorCompletion(
                unionVariantName.text,
                range,
              ),
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
          completions.push(
            this.createTypeAliasCompletion(value, name.text, range),
          );
        }
      }
    }

    return completions;
  }

  private createFunctionCompletion(
    markdownDocumentation: string | undefined,
    label: string,
    range: Range,
  ): CompletionItem {
    return this.createCompletion(
      markdownDocumentation,
      CompletionItemKind.Function,
      label,
      range,
    );
  }

  private createFunctionParameterCompletion(
    markdownDocumentation: string | undefined,
    label: string,
    range: Range,
  ): CompletionItem {
    return this.createPreselectedCompletion(
      markdownDocumentation,
      CompletionItemKind.Field,
      label,
      range,
    );
  }

  private createTypeCompletion(
    markdownDocumentation: string | undefined,
    label: string,
    range: Range,
  ): CompletionItem {
    return this.createCompletion(
      markdownDocumentation,
      CompletionItemKind.Enum,
      label,
      range,
    );
  }

  private createTypeAliasCompletion(
    markdownDocumentation: string | undefined,
    label: string,
    range: Range,
  ): CompletionItem {
    return this.createCompletion(
      markdownDocumentation,
      CompletionItemKind.Struct,
      label,
      range,
    );
  }

  private createOperatorCompletion(
    markdownDocumentation: string | undefined,
    label: string,
    range: Range,
  ): CompletionItem {
    return this.createCompletion(
      markdownDocumentation,
      CompletionItemKind.Operator,
      label,
      range,
    );
  }

  private createUnionConstructorCompletion(
    label: string,
    range: Range,
  ): CompletionItem {
    return this.createCompletion(
      undefined,
      CompletionItemKind.EnumMember,
      label,
      range,
    );
  }

  private createCompletion(
    markdownDocumentation: string | undefined,
    kind: CompletionItemKind,
    label: string,
    range: Range,
  ): CompletionItem {
    return {
      commitCharacters: [" "],
      documentation: {
        kind: MarkupKind.Markdown,
        value: markdownDocumentation || "",
      },
      kind,
      label,
      textEdit: TextEdit.replace(range, label),
    };
  }

  private createPreselectedCompletion(
    markdownDocumentation: string | undefined,
    kind: CompletionItemKind,
    label: string,
    range: Range,
  ): CompletionItem {
    return {
      commitCharacters: [" "],
      documentation: {
        kind: MarkupKind.Markdown,
        value: markdownDocumentation || "",
      },
      kind,
      label,
      preselect: true,
      textEdit: TextEdit.replace(range, label),
    };
  }

  private findDefinitionsForScope(
    node: SyntaxNode,
    tree: Tree,
    range: Range,
  ): CompletionItem[] {
    const result: CompletionItem[] = [];
    if (node.parent) {
      if (node.parent.type === "let_in_expr") {
        const letNode = TreeUtils.findFirstNamedChildOfType("let", node.parent);
        if (letNode) {
          letNode.children.forEach(nodeToProcess => {
            if (
              nodeToProcess &&
              nodeToProcess.type === "value_declaration" &&
              nodeToProcess.firstNamedChild !== null &&
              nodeToProcess.firstNamedChild.type ===
                "function_declaration_left" &&
              nodeToProcess.firstNamedChild.firstNamedChild !== null &&
              nodeToProcess.firstNamedChild.firstNamedChild.type ===
                "lower_case_identifier"
            ) {
              const value = HintHelper.createHintFromDefinitionInLet(
                nodeToProcess,
              );
              result.push(
                this.createFunctionCompletion(
                  value,
                  nodeToProcess.firstNamedChild.firstNamedChild.text,
                  range,
                ),
              );
            }
          });
        }
      }
      if (
        node.parent.type === "case_of_branch" &&
        node.parent.firstNamedChild &&
        node.parent.firstNamedChild.type === "pattern" &&
        node.parent.firstNamedChild.firstNamedChild &&
        node.parent.firstNamedChild.firstNamedChild.type === "union_pattern" &&
        node.parent.firstNamedChild.firstNamedChild.childCount > 1 // Ignore cases of case branches with no params
      ) {
        const caseBranchVariableNodes = TreeUtils.findAllNamedChildrenOfType(
          "lower_pattern",
          node.parent.firstNamedChild.firstNamedChild,
        );
        if (caseBranchVariableNodes) {
          caseBranchVariableNodes.forEach(a => {
            const value = HintHelper.createHintFromDefinitionInCaseBranch();
            result.push(this.createFunctionCompletion(value, a.text, range));
          });
        }
      }
      if (
        node.parent.type === "value_declaration" &&
        node.parent.firstChild &&
        node.parent.firstChild.type === "function_declaration_left"
      ) {
        node.parent.firstChild.children.forEach(child => {
          if (child.type === "lower_pattern") {
            const markdownDocumentation = HintHelper.createHintFromFunctionParameter(
              child,
            );
            result.push(
              this.createFunctionParameterCompletion(
                markdownDocumentation,
                child.text,
                range,
              ),
            );

            const annotationTypeNode = TreeUtils.getTypeOrTypeAliasOfFunctionParameter(
              child,
            );
            if (annotationTypeNode) {
              const typeDeclarationNode = TreeUtils.findTypeAliasDeclaration(
                tree,
                annotationTypeNode.text,
              );
              if (typeDeclarationNode) {
                const fields = TreeUtils.getAllFieldsFromTypeAlias(
                  typeDeclarationNode,
                );
                if (fields) {
                  fields.forEach(element => {
                    const hint = HintHelper.createHintForTypeAliasReference(
                      element.type,
                      element.field,
                      child.text,
                    );
                    result.push(
                      this.createFunctionParameterCompletion(
                        hint,
                        `${child.text}.${element.field}`,
                        range,
                      ),
                    );
                  });
                }
              }
            }
          }
        });
      }
      result.push(...this.findDefinitionsForScope(node.parent, tree, range));
    }

    return result;
  }

  private createSnippet(
    label: string,
    snippetText: string | string[],
    markdownDocumentation?: string,
    kind?: CompletionItemKind,
  ): CompletionItem {
    return {
      documentation: {
        kind: MarkupKind.Markdown,
        value: markdownDocumentation || "",
      },
      insertText: Array.isArray(snippetText)
        ? snippetText.join("\n")
        : snippetText,
      insertTextFormat: InsertTextFormat.Snippet,
      kind: kind || CompletionItemKind.Snippet,
      label,
    };
  }

  // tslint:disable: no-duplicate-string
  // tslint:disable: no-big-function
  private createSnippets() {
    return [
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
        "of",
        ["of", "   $0"],
        "The of keyword",
        CompletionItemKind.Keyword,
      ),
      this.createSnippet(
        "case of",
        [
          "case ${1:expression} of",
          "    ${2:option1} ->",
          "        ${3}",
          "",
          "    ${4:option2} ->",
          "        ${5}",
          "$0",
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
        "type alias",
        [
          "type alias ${1:recordName} =",
          "    { ${2:key1} : ${3:ValueType1}",
          "    , ${4:key2} : ${5:ValueType2}",
          "    }",
        ],
        "Type alias",
      ),
      this.createSnippet(
        "record update",
        ["{ ${1:recordName} | ${2:key} = ${3} }"],
        "Update record",
      ),
      this.createSnippet(
        "anonymous",
        ["\\ ${1:argument} -> ${1:argument}"],
        "Anonymous function",
      ),
      this.createSnippet(
        "type",
        ["type ${1:Typename}", "    = ${2:Value1}", "    | ${3:Value2}"],
        "Custom type",
      ),
      this.createSnippet(
        "msg",
        ["type Msg", "    = ${1:Message}", "    | ${2:Message}"],
        "Default message custom type",
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
        "let in",
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
        "port in",
        ["port ${1:portName} : (${2:Typename} -> msg) -> Sub msg"],
        "Incoming port",
      ),
      this.createSnippet(
        "port out",
        ["port ${1:portName} : ${2:Typename} -> Cmd msg"],
        "Outgoing port",
      ),
      this.createSnippet(
        "main sandbox",
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
        "main element",
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
        "main document",
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
        "main application",
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
        "default model",
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
        "Describe block in Elm-test",
      ),
      this.createSnippet(
        "test",
        ['test "${1:name}" <|', "    \\_ ->", "        ${0}"],
        "Test block in Elm-test",
      ),
      this.createSnippet("todo", "-- TODO: ${0}", "TODO comment"),
    ];
  }
}
