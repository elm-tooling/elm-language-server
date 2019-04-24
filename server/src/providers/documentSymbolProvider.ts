import { SyntaxNode, Tree } from "tree-sitter";
import {
  DocumentSymbol,
  DocumentSymbolParams,
  IConnection,
  Position,
  Range,
  SymbolInformation,
  SymbolKind,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { TreeUtils } from "../util/treeUtils";

export class DocumentSymbolProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onDocumentSymbol(this.handleDocumentSymbolRequest);
  }

  private createSymbolInformation(
    name: string,
    node: SyntaxNode,
    symbolKind: SymbolKind,
  ): SymbolInformation {
    return SymbolInformation.create(
      name,
      symbolKind,
      Range.create(
        Position.create(node.startPosition.row, node.startPosition.column),
        Position.create(node.endPosition.row, node.endPosition.column),
      ),
    );
  }

  private handleDocumentSymbolRequest = async (
    param: DocumentSymbolParams,
  ): Promise<SymbolInformation[] | DocumentSymbol[] | null | undefined> => {
    const symbolInformation: SymbolInformation[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    const traverse: (node: SyntaxNode) => void = (node: SyntaxNode): void => {
      if (node.type === "file") {
        symbolInformation.push(
          this.createSymbolInformation("file", node, SymbolKind.File),
        );
      } else if (node.type === "value_declaration") {
        symbolInformation.push(
          this.createSymbolInformation(
            node.children[0].children[0].text,
            node,
            SymbolKind.Function,
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
            this.createSymbolInformation(nameNode.text, node, SymbolKind.Enum),
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
            ),
          );
        }
      } else if (node.type === "union_variant") {
        symbolInformation.push(
          this.createSymbolInformation(node.text, node, SymbolKind.EnumMember),
        );
      } else if (node.type === "number_constant_expr") {
        symbolInformation.push(
          this.createSymbolInformation(node.text, node, SymbolKind.Number),
        );
      } else if (node.type === "string_constant_expr") {
        symbolInformation.push(
          this.createSymbolInformation(node.text, node, SymbolKind.String),
        );
      } else if (node.type === "operator_identifier") {
        symbolInformation.push(
          this.createSymbolInformation(node.text, node, SymbolKind.Operator),
        );
      }

      for (const childNode of node.children) {
        traverse(childNode);
      }
    };
    if (tree) {
      traverse(tree.rootNode);
    }

    return symbolInformation;
  };
}
