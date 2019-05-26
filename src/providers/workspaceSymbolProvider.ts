import { SyntaxNode } from "tree-sitter";
import {
  IConnection,
  SymbolInformation,
  WorkspaceSymbolParams,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { SymbolInformationTranslator } from "../util/symbolTranslator";

export class WorkspaceSymbolProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onWorkspaceSymbol(this.workspaceSymbolRequest);
  }

  private workspaceSymbolRequest = async (
    param: WorkspaceSymbolParams,
  ): Promise<SymbolInformation[] | null | undefined> => {
    const symbolInformations: SymbolInformation[] = [];

    this.forest.treeIndex.forEach(tree => {
      const traverse: (node: SyntaxNode) => void = (node: SyntaxNode): void => {
        const symbolInformation = SymbolInformationTranslator.translateNodeToSymbolInformation(
          tree.uri,
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
        traverse(tree.tree.rootNode);
      }
    });

    return symbolInformations;
  };
}
