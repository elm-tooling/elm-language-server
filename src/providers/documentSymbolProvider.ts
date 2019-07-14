import { SyntaxNode, Tree } from "tree-sitter";
import {
  DocumentSymbol,
  DocumentSymbolParams,
  IConnection,
  SymbolInformation,
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
    // tslint:disable-next-line: max-union-size
  ): Promise<SymbolInformation[] | DocumentSymbol[] | null | undefined> => {
    this.connection.console.info(`Document Symbols were requested`);
    const symbolInformationList: SymbolInformation[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    const traverse: (node: SyntaxNode) => void = (node: SyntaxNode): void => {
      const symbolInformation = SymbolInformationTranslator.translateNodeToSymbolInformation(
        param.textDocument.uri,
        node,
      );
      if (symbolInformation) {
        symbolInformationList.push(symbolInformation);
      }

      for (const childNode of node.children) {
        traverse(childNode);
      }
    };
    if (tree) {
      traverse(tree.rootNode);
    }

    return symbolInformationList;
  };
}
