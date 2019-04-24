import { SyntaxNode, Tree } from "tree-sitter";

export type Exposing =
  | "all"
  | Array<
      | string
      | { name: string; exposedUnionConstructors: string[] }
      | { name: string; exposedUnionConstructors: "all" }
    >;

export class TreeUtils {
  public static getModuleName(
    tree: Tree,
  ): { moduleName: string; exposing: Exposing } | undefined {
    const moduleDeclaration:
      | SyntaxNode
      | undefined = this.findFirstNamedChildOfType(
      "module_declaration",
      tree.rootNode,
    );
    if (moduleDeclaration) {
      const moduleName = this.findFirstNamedChildOfType(
        "upper_case_qid",
        moduleDeclaration,
      );

      const exposingList = this.findFirstNamedChildOfType(
        "exposing_list",
        moduleDeclaration,
      );
      if (exposingList) {
        const exposed: Exposing = [];
        if (TreeUtils.findFirstNamedChildOfType("double_dot", exposingList)) {
          if (moduleName) {
            return { moduleName: moduleName.text, exposing: "all" };
          }
        } else {
          const exposedValues = exposingList.descendantsOfType("exposed_value");

          for (const value of exposedValues) {
            exposed.push(value.text);
          }

          const exposedTypes = exposingList.descendantsOfType("exposed_type");
          for (const value of exposedTypes) {
            const doubleDot = value.descendantsOfType("double_dot");
            const exposedConstructors = value.descendantsOfType(
              "exposed_union_constructor",
            );
            if (doubleDot.length > 0) {
              const name = TreeUtils.findFirstNamedChildOfType(
                "upper_case_identifier",
                value,
              );
              if (name) {
                exposed.push({
                  exposedUnionConstructors: "all",
                  name: name.text,
                });
              }
            } else if (exposedConstructors.length > 0) {
              const name = TreeUtils.findFirstNamedChildOfType(
                "upper_case_identifier",
                value,
              );
              if (name) {
                exposed.push({
                  exposedUnionConstructors: exposedConstructors.map(
                    a => a.text,
                  ),
                  name: name.text,
                });
              }
            } else {
              exposed.push(value.text);
            }
          }

          if (moduleName) {
            return { moduleName: moduleName.text, exposing: exposed };
          }
        }
      }
    }
  }

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
    const module = TreeUtils.findFirstNamedChildOfType(
      "module_declaration",
      tree.rootNode,
    );
    if (module) {
      const descendants = module.descendantsOfType("exposed_value");
      return descendants.some(desc => desc.text === functionName);
    }
    return false;
  }

  public static isExposedType(tree: Tree, typeName: string) {
    const module = TreeUtils.findFirstNamedChildOfType(
      "module_declaration",
      tree.rootNode,
    );
    if (module) {
      const descendants = module.descendantsOfType("exposed_type");
      return descendants.some(desc => desc.text.startsWith(typeName));
    }
    return false;
  }
}
