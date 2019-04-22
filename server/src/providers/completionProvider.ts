import { SyntaxNode, Tree } from "tree-sitter";
import {
  CompletionItem,
  CompletionParams,
  CompletionRequest,
  IConnection,
  SymbolKind,
  MarkupKind,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { hintHelper } from "../util/hintHelper";
import { treeUtils } from "../treeUtils";

export class CompletionProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onCompletion(this.handleCompletionRequest);
    this.connection.onCompletionResolve(this.handleCompletionResolveRequest);
  }

  protected handleCompletionRequest = (
    param: CompletionParams,
  ): CompletionItem[] | null | undefined => {
    const completions: CompletionItem[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      const functions = treeUtils.findAllNamedChildsOfType(
        "value_declaration",
        tree.rootNode,
      );
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
          const value = hintHelper.createHintFromValueDeclaration(declaration);
          if (value !== undefined) {
            completions.push({
              kind: SymbolKind.Function,
              label: declaration.firstNamedChild!.firstNamedChild!.text,
              documentation: {
                kind: MarkupKind.Markdown,
                value,
              },
            });
          }
        }
      }

      // Add types
      const typeDeclarations = tree.rootNode.descendantsOfType(
        "type_declaration",
      );

      for (const declaration of typeDeclarations) {
        const value = hintHelper.createHintFromValueDeclaration(declaration);
        const name = treeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          declaration,
        );
        if (value !== undefined && name) {
          completions.push({
            kind: SymbolKind.Enum,
            label: name.text,
            documentation: {
              kind: MarkupKind.Markdown,
              value,
            },
          });
        }
      }
      // Add types constucturs
      const unionVariants = tree.rootNode.descendantsOfType("union_variant");

      for (const declaration of unionVariants) {
        const name = treeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          declaration,
        );
        if (name) {
          completions.push({
            kind: SymbolKind.Enum,
            label: name.text,
          });
        }
      }

      // Add alias types
      const typeAliasDeclarations = tree.rootNode.descendantsOfType(
        "type_alias_declaration",
      );

      for (const declaration of typeAliasDeclarations) {
        const value = hintHelper.createHintFromValueDeclaration(declaration);
        const name = treeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          declaration,
        );
        if (value !== undefined && name) {
          completions.push({
            kind: SymbolKind.Struct,
            label: name.text,
            documentation: {
              kind: MarkupKind.Markdown,
              value,
            },
          });
        }
      }
    }

    return completions;
  };

  handleCompletionResolveRequest(item: CompletionItem): CompletionItem {
    const param = item.data;
    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);
    // item.detail
    // item.documentation

    if (tree) {
      let newItem = item;

      return newItem;
    }

    return item;
  }
}
