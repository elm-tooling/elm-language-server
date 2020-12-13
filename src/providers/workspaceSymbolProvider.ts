import { container } from "tsyringe";
import {
  Connection,
  SymbolInformation,
  WorkspaceSymbolParams,
} from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { IElmWorkspace } from "../elmWorkspace";
import { SymbolInformationTranslator } from "../util/symbolTranslator";

export class WorkspaceSymbolProvider {
  private readonly connection: Connection;
  private readonly elmWorkspaces: IElmWorkspace[];

  constructor() {
    this.elmWorkspaces = container.resolve<IElmWorkspace[]>("ElmWorkspaces");
    this.connection = container.resolve<Connection>("Connection");
    this.connection.onWorkspaceSymbol(this.workspaceSymbolRequest);
  }

  private workspaceSymbolRequest = (
    param: WorkspaceSymbolParams,
  ): SymbolInformation[] | null | undefined => {
    this.connection.console.info(`Workspace Symbols were requested`);
    const symbolInformationMap: Map<string, SymbolInformation[]> = new Map<
      string,
      SymbolInformation[]
    >();

    this.elmWorkspaces.forEach((elmWorkspace) => {
      elmWorkspace.getForest().treeMap.forEach((tree) => {
        const traverse: (node: SyntaxNode) => void = (
          node: SyntaxNode,
        ): void => {
          if (node.text.includes(param.query)) {
            const symbolInformation = SymbolInformationTranslator.translateNodeToSymbolInformation(
              tree.uri.toString(),
              node,
            );
            if (symbolInformation) {
              const current =
                symbolInformationMap.get(tree.uri.toString()) || [];
              symbolInformationMap.set(tree.uri.toString(), [
                ...current,
                symbolInformation,
              ]);
            }
          }

          for (const childNode of node.children) {
            traverse(childNode);
          }
        };

        // skip URIs already traversed in a previous Elm workspace
        if (tree && !symbolInformationMap.get(tree.uri.toString())) {
          traverse(tree.tree.rootNode);
        }
      });
    });

    return Array.from(symbolInformationMap.values()).flat();
  };
}
