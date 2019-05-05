import { SyntaxNode, Tree } from "tree-sitter";
import {
  CompletionItem,
  CompletionParams,
  IConnection,
  MarkupKind,
  SymbolKind,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { HintHelper } from "../util/hintHelper";
import { TreeUtils } from "../util/treeUtils";

export class CompletionProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onCompletion(this.handleCompletionRequest);
  }

  private handleCompletionRequest = (
    param: CompletionParams,
  ): CompletionItem[] | null | undefined => {
    const completions: CompletionItem[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    if (tree) {
      this.findLocalSymbols(tree, completions);
    }

    return completions;
  };

  private findLocalSymbols(tree: Tree, completions: CompletionItem[]) {
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
        const value = HintHelper.createHintFromDefinition(declaration);
        if (value !== undefined) {
          completions.push({
            documentation: {
              kind: MarkupKind.Markdown,
              value,
            },
            kind: SymbolKind.Function,
            label: declaration.firstNamedChild!.firstNamedChild!.text,
          });
        }
      }
    }
    // Add types
    const typeDeclarations = TreeUtils.findAllTypeDeclarations(tree);
    if (typeDeclarations) {
      for (const declaration of typeDeclarations) {
        const value = HintHelper.createHintFromDefinition(declaration);
        const name = TreeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          declaration,
        );
        if (value !== undefined && name) {
          completions.push({
            documentation: {
              kind: MarkupKind.Markdown,
              value,
            },
            kind: SymbolKind.Enum,
            label: name.text,
          });
        }
        // Add types constucturs
        const unionVariants = declaration.descendantsOfType("union_variant");
        for (const unionVariant of unionVariants) {
          const unionVariantName = TreeUtils.findFirstNamedChildOfType(
            "upper_case_identifier",
            unionVariant,
          );
          if (unionVariantName) {
            completions.push({
              kind: SymbolKind.Enum,
              label: unionVariantName.text,
            });
          }
        }
      }
    }
    // Add alias types
    const typeAliasDeclarations = TreeUtils.findAllTypeAliasDeclarations(tree);
    if (typeAliasDeclarations) {
      for (const declaration of typeAliasDeclarations) {
        const value = HintHelper.createHintFromDefinition(declaration);
        const name = TreeUtils.findFirstNamedChildOfType(
          "upper_case_identifier",
          declaration,
        );
        if (value !== undefined && name) {
          completions.push({
            documentation: {
              kind: MarkupKind.Markdown,
              value,
            },
            kind: SymbolKind.Struct,
            label: name.text,
          });
        }
      }
    }
  }
}
