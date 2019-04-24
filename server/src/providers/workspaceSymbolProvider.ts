import { SyntaxNode } from "tree-sitter";
import {
  IConnection,
  Position,
  Range,
  SymbolInformation,
  SymbolKind,
  WorkspaceSymbolParams,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { TreeUtils } from "../util/treeUtils";

export class WorkspaceSymbolProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onWorkspaceSymbol(this.workspaceSymbolRequest);
  }

  private createSymbolInformation(
    name: string,
    node: SyntaxNode,
    symbolKind: SymbolKind,
    uri: string,
  ): SymbolInformation {
    return SymbolInformation.create(
      name,
      symbolKind,
      Range.create(
        Position.create(node.startPosition.row, node.startPosition.column),
        Position.create(node.endPosition.row, node.endPosition.column),
      ),
      uri,
    );
  }

  private workspaceSymbolRequest = async (
    param: WorkspaceSymbolParams,
  ): Promise<SymbolInformation[] | null | undefined> => {
    const symbolInformation: SymbolInformation[] = [];

    this.forest.treeIndex.forEach(tree => {
      const traverse: (node: SyntaxNode) => void = (node: SyntaxNode): void => {
        if (node.type === "file") {
          symbolInformation.push(
            this.createSymbolInformation(
              "file",
              node,
              SymbolKind.File,
              tree.uri,
            ),
          );
        } else if (node.type === "value_declaration") {
          symbolInformation.push(
            this.createSymbolInformation(
              node.children[0].children[0].text,
              node,
              SymbolKind.Function,
              tree.uri,
            ),
          );
        } else if (node.type === "module_declaration") {
          const nameNode = TreeUtils.findFirstNamedChildOfType(
            "upper_case_qid",
            node,
          );
          if (nameNode) {
            symbolInformation.push(
              this.createSymbolInformation(
                nameNode.text,
                node,
                SymbolKind.Module,
                tree.uri,
              ),
            );
          }
        } else if (node.type === "type_declaration") {
          const nameNode = TreeUtils.findFirstNamedChildOfType(
            "upper_case_identifier",
            node,
          );
          if (nameNode) {
            symbolInformation.push(
              this.createSymbolInformation(
                nameNode.text,
                node,
                SymbolKind.Enum,
                tree.uri,
              ),
            );
          }
        } else if (node.type === "type_alias_declaration") {
          const nameNode = TreeUtils.findFirstNamedChildOfType(
            "upper_case_identifier",
            node,
          );
          if (nameNode) {
            symbolInformation.push(
              this.createSymbolInformation(
                nameNode.text,
                node,
                SymbolKind.Struct,
                tree.uri,
              ),
            );
          }
        } else if (node.type === "union_variant") {
          symbolInformation.push(
            this.createSymbolInformation(
              node.text,
              node,
              SymbolKind.EnumMember,
              tree.uri,
            ),
          );
        } else if (node.type === "number_constant_expr") {
          symbolInformation.push(
            this.createSymbolInformation(
              node.text,
              node,
              SymbolKind.Number,
              tree.uri,
            ),
          );
        } else if (node.type === "string_constant_expr") {
          symbolInformation.push(
            this.createSymbolInformation(
              node.text,
              node,
              SymbolKind.String,
              tree.uri,
            ),
          );
        } else if (node.type === "operator_identifier") {
          symbolInformation.push(
            this.createSymbolInformation(
              node.text,
              node,
              SymbolKind.Operator,
              tree.uri,
            ),
          );
        }

        for (const childNode of node.children) {
          traverse(childNode);
        }
      };

      if (tree) {
        traverse(tree.tree.rootNode);
      }
    });

    return symbolInformation;
  };
}
