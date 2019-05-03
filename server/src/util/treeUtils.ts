import { SyntaxNode, Tree } from "tree-sitter";

export type NodeType = "Function" | "TypeAlias" | "Type";

export type Exposing = Array<
  | { name: string; syntaxNode: SyntaxNode; type: NodeType }
  | {
      name: string;
      syntaxNode: SyntaxNode;
      type: NodeType;
      exposedUnionConstructors: string[];
    }
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
            const functions = tree.rootNode.descendantsOfType(
              "value_declaration",
            );
            if (functions) {
              functions.forEach(elmFunction => {
                const declaration = TreeUtils.findFirstNamedChildOfType(
                  "function_declaration_left",
                  elmFunction,
                );
                if (declaration && declaration.firstNamedChild) {
                  const functionName = declaration.firstNamedChild.text;
                  exposed.push({
                    name: functionName,
                    syntaxNode: declaration,
                    type: "Function",
                  });
                }
              });
            }

            const typeAliases = tree.rootNode.descendantsOfType(
              "type_alias_declaration",
            );
            if (typeAliases) {
              typeAliases.forEach(typeAlias => {
                const name = TreeUtils.findFirstNamedChildOfType(
                  "upper_case_identifier",
                  typeAlias,
                );
                if (name) {
                  exposed.push({
                    name: name.text,
                    syntaxNode: typeAlias,
                    type: "TypeAlias",
                  });
                }
              });
            }

            const typeDeclarations = tree.rootNode.descendantsOfType(
              "type_declaration",
            );
            if (typeDeclarations) {
              typeDeclarations.forEach(typeDeclaration => {
                const unionCostructors: string[] = [];
                typeDeclaration
                  .descendantsOfType("union_variant")
                  .forEach(variant => {
                    const name = TreeUtils.findFirstNamedChildOfType(
                      "upper_case_identifier",
                      variant,
                    );
                    if (name) {
                      unionCostructors.push(name.text);
                    }
                  });
                const typeDeclarationName = TreeUtils.findFirstNamedChildOfType(
                  "upper_case_identifier",
                  typeDeclaration,
                );
                if (typeDeclarationName) {
                  exposed.push({
                    exposedUnionConstructors: unionCostructors,
                    name: typeDeclarationName.text,
                    syntaxNode: typeDeclaration,
                    type: "Type",
                  });
                }
              });

              return { moduleName: moduleName.text, exposing: exposed };
            }
          }
        } else {
          const exposedValues = exposingList.descendantsOfType("exposed_value");

          for (const value of exposedValues) {
            const functionNode = this.findFunction(tree, value.text);
            if (functionNode) {
              exposed.push({
                name: value.text,
                syntaxNode: functionNode,
                type: "Function",
              });
            }
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
                const typeDeclaration = tree.rootNode
                  .descendantsOfType("type_declaration")
                  .find(
                    a =>
                      a.children.length > 1 &&
                      a.children[1].type === "upper_case_identifier" &&
                      a.children[1].text === name.text,
                  );
                if (typeDeclaration) {
                  const unionCostructors: string[] = [];
                  typeDeclaration
                    .descendantsOfType("union_variant")
                    .forEach(variant => {
                      const unionConstructorName = TreeUtils.findFirstNamedChildOfType(
                        "upper_case_identifier",
                        variant,
                      );
                      if (unionConstructorName) {
                        unionCostructors.push(unionConstructorName.text);
                      }
                    });

                  exposed.push({
                    exposedUnionConstructors: unionCostructors,
                    name: name.text,
                    syntaxNode: typeDeclaration,
                    type: "Type",
                  });
                }
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
                  // Todo find the correct node
                  syntaxNode: value,
                  type: "Type",
                });
              }
            } else {
              // Todo find the correct node
              // Separate between type alias and type here
              exposed.push({
                name: value.text,
                syntaxNode: value,
                type: "TypeAlias",
              });
              // exposed.push({ name: value.text, syntaxNode: value, type: "TypeAlias" });
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

  public static findFunction(
    tree: Tree,
    functionName: string,
  ): SyntaxNode | undefined {
    const functions = tree.rootNode.descendantsOfType("value_declaration");
    if (functions) {
      return functions.find(elmFunction => {
        const declaration = TreeUtils.findFirstNamedChildOfType(
          "function_declaration_left",
          elmFunction,
        );
        if (declaration && declaration.firstNamedChild) {
          return functionName === declaration.firstNamedChild.text;
        }
        return false;
      });
    }
  }
}
