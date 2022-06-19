import { container } from "tsyringe";
import {
  Connection,
  SymbolInformation,
  WorkspaceSymbolParams,
} from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { IProgram } from "../compiler/program.js";
import { SymbolInformationTranslator } from "../util/symbolTranslator.js";

export class WorkspaceSymbolProvider {
  private readonly connection: Connection;
  private readonly elmWorkspaces: IProgram[];

  constructor() {
    this.elmWorkspaces = container.resolve<IProgram[]>("ElmWorkspaces");
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

    this.elmWorkspaces.forEach((program) => {
      program.getForest().treeMap.forEach((tree) => {
        if (!tree.writeable) {
          return;
        }
        const traverse: (node: SyntaxNode) => void = (
          node: SyntaxNode,
        ): void => {
          if (this.isPatternInSymbol(param.query, node.text)) {
            const symbolInformation =
              SymbolInformationTranslator.translateNodeToSymbolInformation(
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

  // Determines if typed string matches a symbol
  // name. Characters must appear in order.
  // Return true if all typed characters are in symbol
  private isPatternInSymbol(typedValue: string, symbolName: string): boolean {
    const typedLower = typedValue.toLocaleLowerCase();
    const symbolLower = symbolName.toLocaleLowerCase();
    const typedLength = typedLower.length;
    const symbolLength = symbolLower.length;
    let typedPos = 0;
    let symbolPos = 0;
    while (typedPos < typedLength && symbolPos < symbolLength) {
      if (typedLower[typedPos] === symbolLower[symbolPos]) {
        typedPos += 1;
      }
      symbolPos += 1;
    }
    return typedPos === typedLength;
  }
}
