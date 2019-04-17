import { SyntaxNode, Tree } from "tree-sitter";
import {
  IConnection,
  Range,
  Position,
  SymbolInformation,
  SymbolKind,
  WorkspaceSymbolParams,
} from "vscode-languageserver";
import { IForest } from "../forest";

export class WorkspaceSymbolProvider {
  private connection: IConnection;
  private forest: IForest;

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onWorkspaceSymbol(this.workspaceSymbolRequest);
  }

  protected workspaceSymbolRequest = async (
    param: WorkspaceSymbolParams,
  ): Promise<SymbolInformation[] | null | undefined> => {
    const symbolInformation: SymbolInformation[] = [];

    for (const [path, tree] of this.forest.trees) {
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
              path,
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
    }

    return symbolInformation;
  };
}
