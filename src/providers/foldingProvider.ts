import { SyntaxNode, Tree } from "tree-sitter";
import {
  FoldingRange,
  FoldingRangeKind,
  FoldingRangeRequestParam,
  IConnection,
} from "vscode-languageserver";
import { IForest } from "../forest";

export class FoldingRangeProvider {
  private connection: IConnection;
  private forest: IForest;
  private readonly REGION_CONSTRUCTS: Set<string> = new Set([
    "if_else_expr",
    "case_of_expr",
    "value_declaration",
    "type_alias_declaration",
    "type_declaration",
    "record_expr",
  ]);

  constructor(connection: IConnection, forest: IForest) {
    this.connection = connection;
    this.forest = forest;

    this.connection.onFoldingRanges(this.handleFoldingRange);
  }

  protected handleFoldingRange = async (
    param: FoldingRangeRequestParam,
  ): Promise<FoldingRange[]> => {
    this.connection.console.info(`Folding ranges were requested`);
    const folds: FoldingRange[] = [];

    const tree: Tree | undefined = this.forest.getTree(param.textDocument.uri);

    const findLastIdenticalNamedSibling: (node: SyntaxNode) => SyntaxNode = (
      node: SyntaxNode,
    ): SyntaxNode => {
      while (true) {
        if (
          node.nextNamedSibling &&
          node.nextNamedSibling.type === "import_clause"
        ) {
          node = node.nextNamedSibling;
        } else {
          return node;
        }
      }
    };

    const traverse: (node: SyntaxNode) => void = (node: SyntaxNode): void => {
      if (node.parent && node.parent.lastChild && node.isNamed) {
        if ("import_clause" === node.type) {
          if (
            node.previousNamedSibling === null ||
            node.previousNamedSibling.type !== "import_clause"
          ) {
            const lastNode = findLastIdenticalNamedSibling(node);
            folds.push({
              endCharacter: lastNode.endPosition.column,
              endLine: lastNode.endPosition.row,
              kind: FoldingRangeKind.Imports,
              startCharacter: node.startPosition.column,
              startLine: node.startPosition.row,
            });
          }
        } else if (this.REGION_CONSTRUCTS.has(node.type)) {
          folds.push({
            endCharacter: node.endPosition.column,
            endLine: node.endPosition.row,
            kind: FoldingRangeKind.Region,
            startCharacter: node.startPosition.column,
            startLine: node.startPosition.row,
          });
        } else if ("block_comment" === node.type) {
          folds.push({
            endCharacter: node.endPosition.column,
            endLine: node.endPosition.row,
            kind: FoldingRangeKind.Comment,
            startCharacter: node.startPosition.column,
            startLine: node.startPosition.row,
          });
        }
      }
      for (const childNode of node.children) {
        traverse(childNode);
      }
    };
    if (tree) {
      traverse(tree.rootNode);
    }

    return folds;
  };
}
