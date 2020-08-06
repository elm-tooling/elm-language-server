import {
  IConnection,
  SymbolInformation,
  WorkspaceSymbolParams,
} from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { IElmWorkspace } from "../elmWorkspace";
import { SymbolInformationTranslator } from "../util/symbolTranslator";
import { container, DependencyContainer } from "tsyringe";

export class WorkspaceSymbolProvider {
  private readonly connection: IConnection;
  private readonly elmWorkspaces: IElmWorkspace[];

  constructor(workspaceChildContainer: DependencyContainer) {
    this.elmWorkspaces = workspaceChildContainer.resolve<IElmWorkspace[]>(
      "ElmWorkspaces",
    );
    this.connection = container.resolve<IConnection>("Connection");
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
      elmWorkspace.getForest().treeIndex.forEach((tree) => {
        const traverse: (node: SyntaxNode) => void = (
          node: SyntaxNode,
        ): void => {
          if (node.text.includes(param.query)) {
            const symbolInformation = SymbolInformationTranslator.translateNodeToSymbolInformation(
              tree.uri,
              node,
            );
            if (symbolInformation) {
              const current = symbolInformationMap.get(tree.uri) || [];
              symbolInformationMap.set(tree.uri, [
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
        if (tree && !symbolInformationMap.get(tree.uri)) {
          traverse(tree.tree.rootNode);
        }
      });
    });

    return Array.from(symbolInformationMap.values()).flat();
  };
}
