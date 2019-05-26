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
import { SymbolInformationTranslator } from "../util/symbolTranslator";

export class DocumentSymbolProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onDocumentSymbol(this.handleDocumentSymbolRequest);
  }

  private handleDocumentSymbolRequest = async (
    param: DocumentSymbolParams,
  ): Promise<SymbolInformation[] | DocumentSymbol[] | null | undefined> => {
    const symbolInformations: SymbolInformation[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    const traverse: (node: SyntaxNode) => void = (node: SyntaxNode): void => {
      const symbolInformation = SymbolInformationTranslator.translateNodeToSymbolInformation(
        param.textDocument.uri,
        node,
      );
      if (symbolInformation) {
        symbolInformations.push(symbolInformation);
      }

      for (const childNode of node.children) {
        traverse(childNode);
      }
    };
    if (tree) {
      traverse(tree.rootNode);
    }

    return symbolInformations;
  };
}
