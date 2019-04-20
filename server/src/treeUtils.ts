import { SyntaxNode, Tree, TreeCursor, Edit, Range } from "tree-sitter";

export class treeUtils {
  public static pipe = (...fns: any) => (x: any) =>
    fns.reduce((v: any, f: any) => f(v), x);

  public static findFirstNamedChildOfType(
    type: string,
    node: SyntaxNode,
  ): SyntaxNode | undefined {
    return node.children.find(child => child.type === type);
  }
  public static findAllNamedChildsOfType(
    type: string,
    node: SyntaxNode,
  ): SyntaxNode[] | undefined {
    return node.children.filter(child => child.type === type);
  }
}
