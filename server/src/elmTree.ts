import { SyntaxNode, Tree, TreeCursor, Edit, Range } from "tree-sitter";

export interface elmTree {
  readonly rootNode: SyntaxNode;

  edit(delta: Edit): Tree;
  walk(): TreeCursor;
  getChangedRanges(other: Tree): Range[];
  getEditedRange(other: Tree): Range;
}
