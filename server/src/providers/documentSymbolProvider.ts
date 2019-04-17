import { SyntaxNode, Tree } from "tree-sitter";
import {
  IConnection,
  Range,
  Position,
  DocumentSymbolParams,
  SymbolInformation,
  DocumentSymbol,
  SymbolKind,
} from "vscode-languageserver";
import { IForest } from "../forest";

export class DocumentSymbolProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onDocumentSymbol(this.handleDocumentSymbolRequest);
  }

  protected handleDocumentSymbolRequest = async (
    param: DocumentSymbolParams,
  ): Promise<SymbolInformation[] | DocumentSymbol[] | null | undefined> => {
    const symbolInformation: SymbolInformation[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    const traverse: (node: SyntaxNode) => void = (node: SyntaxNode): void => {
      if (node.type === "value_declaration") {
        symbolInformation.push(
          SymbolInformation.create(
            node.children[0].text,
            SymbolKind.Function,
            Range.create(
              Position.create(
                node.startPosition.row,
                node.startPosition.column,
              ),
              Position.create(node.endPosition.row, node.endPosition.column),
            ),
          ),
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
