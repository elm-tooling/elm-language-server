import { container } from "tsyringe";
import {
  FoldingRange,
  FoldingRangeKind,
  Connection,
  FoldingRangeParams,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { IFoldingRangeParams } from "./paramsExtensions";

export class FoldingRangeProvider {
  private readonly REGION_CONSTRUCTS: Set<string> = new Set([
    "case_of_expr",
    "value_declaration",
    "type_alias_declaration",
    "type_declaration",
    "record_expr",
    "case_of_branch",
  ]);
  private connection: Connection;
  constructor() {
    this.connection = container.resolve<Connection>("Connection");
    this.connection.onFoldingRanges(
      new ElmWorkspaceMatcher((param: FoldingRangeParams) =>
        URI.parse(param.textDocument.uri),
      ).handle(this.handleFoldingRange.bind(this)),
    );
  }

  protected handleFoldingRange = (
    param: IFoldingRangeParams,
  ): FoldingRange[] => {
    this.connection.console.info(`Folding ranges were requested`);
    const folds: FoldingRange[] = [];
    const tree: Tree = param.sourceFile.tree;

    const findLastIdenticalNamedSibling: (node: SyntaxNode) => SyntaxNode = (
      node: SyntaxNode,
    ): SyntaxNode => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const nextSibling = node.nextNamedSibling;
        if (nextSibling?.type === "import_clause") {
          node = nextSibling;
        } else {
          return node;
        }
      }
    };

    const treeCursor = tree.walk();

    const traverse: () => void = (): void => {
      const node = treeCursor.currentNode();
      if (node.parent?.lastChild && node.isNamed) {
        if ("import_clause" === node.type) {
          const previousSibling = node.previousNamedSibling;
          if (
            previousSibling === null ||
            previousSibling.type !== "import_clause"
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
        } else if (node.type === "let_in_expr") {
          // Use fields in the future
          const valueDeclarations = node.namedChildren.filter(
            (n) => n.type === "value_declaration",
          );
          const lastValueDeclaration =
            valueDeclarations[valueDeclarations.length - 1];
          const letBody = node.lastNamedChild;

          if (lastValueDeclaration) {
            folds.push({
              endCharacter: lastValueDeclaration.endPosition.column,
              endLine: lastValueDeclaration.endPosition.row,
              kind: FoldingRangeKind.Region,
              startCharacter: node.startPosition.column,
              startLine: node.startPosition.row,
            });
          }

          if (letBody) {
            folds.push({
              endCharacter: node.endPosition.column,
              endLine: node.endPosition.row,
              kind: FoldingRangeKind.Region,
              startCharacter: letBody.startPosition.column,
              startLine: letBody.startPosition.row - 1,
            });
          }
        } else if (node.type === "if_else_expr") {
          node.namedChildren.slice(1).forEach((child) => {
            folds.push({
              endCharacter: child.endPosition.column,
              endLine: child.endPosition.row,
              kind: FoldingRangeKind.Region,
              startCharacter: child.startPosition.column,
              startLine: child.startPosition.row - 1,
            });
          });
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

      if (treeCursor.gotoFirstChild()) {
        traverse();

        while (treeCursor.gotoNextSibling()) {
          traverse();
        }

        treeCursor.gotoParent();
      }
    };

    traverse();

    this.connection.console.info(`Returned ${folds.length} folding ranges`);
    return folds;
  };
}
