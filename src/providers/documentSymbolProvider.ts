import {
  DocumentSymbol,
  DocumentSymbolParams,
  IConnection,
  SymbolInformation,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { ElmWorkspace } from "../elmWorkspace";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { SymbolInformationTranslator } from "../util/symbolTranslator";

type DocumentSymbolResult =
  | SymbolInformation[]
  | DocumentSymbol[]
  | null
  | undefined;

export class DocumentSymbolProvider {
  constructor(private connection: IConnection, elmWorkspaces: ElmWorkspace[]) {
    connection.onDocumentSymbol(
      new ElmWorkspaceMatcher(elmWorkspaces, (param: DocumentSymbolParams) =>
        URI.parse(param.textDocument.uri),
      ).handlerForWorkspace(this.handleDocumentSymbolRequest),
    );
  }

  private handleDocumentSymbolRequest = async (
    param: DocumentSymbolParams,
    elmWorkspace: ElmWorkspace,
  ): Promise<DocumentSymbolResult> => {
    this.connection.console.info(`Document Symbols were requested`);
    const symbolInformationList: SymbolInformation[] = [];

    const forest = elmWorkspace.getForest();
    const tree: Tree | undefined = forest.getTree(param.textDocument.uri);

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
