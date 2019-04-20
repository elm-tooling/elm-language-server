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

  public static isExposedFunction(tree: Tree, functionName: string) {
    let module = treeUtils.findFirstNamedChildOfType(
      "module_declaration",
      tree.rootNode,
    );
    if (module) {
      let descendants = module.descendantsOfType("exposed_value");
      return descendants.some(desc => desc.text === functionName);
    }
    return false;
  }

  public static isExposedType(tree: Tree, typeName: string) {
    let module = treeUtils.findFirstNamedChildOfType(
      "module_declaration",
      tree.rootNode,
    );
    if (module) {
      let descendants = module.descendantsOfType("exposed_type");
      return descendants.some(desc => desc.text.startsWith(typeName));
    }
    return false;
  }
}
