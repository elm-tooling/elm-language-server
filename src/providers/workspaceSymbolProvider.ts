import { SyntaxNode } from "tree-sitter";
import {
  IConnection,
  SymbolInformation,
  WorkspaceSymbolParams,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { SymbolInformationTranslator } from "../util/symbolTranslator";

export class WorkspaceSymbolProvider {
  constructor(
    private readonly connection: IConnection,
    private readonly forest: IForest,
  ) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onWorkspaceSymbol(this.workspaceSymbolRequest);
  }

  private workspaceSymbolRequest = async (
    param: WorkspaceSymbolParams,
  ): Promise<SymbolInformation[] | null | undefined> => {
    this.connection.console.info(`Workspace Symbols were requested`);
    const symbolInformationList: SymbolInformation[] = [];

    this.forest.treeIndex.forEach(tree => {
      const traverse: (node: SyntaxNode) => void = (node: SyntaxNode): void => {
        if (node.text.includes(param.query)) {
          const symbolInformation = SymbolInformationTranslator.translateNodeToSymbolInformation(
            tree.uri,
            node,
          );
          if (symbolInformation) {
            symbolInformationList.push(symbolInformation);
          }
        }

        for (const childNode of node.children) {
          traverse(childNode);
        }
      };

      if (tree) {
        traverse(tree.tree.rootNode);
      }
    });

    return symbolInformationList;
  };
}
