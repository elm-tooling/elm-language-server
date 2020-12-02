/* eslint-disable @typescript-eslint/no-use-before-define */
import { ITreeContainer } from "../../forest";
import { SyntaxNode } from "web-tree-sitter";
import { MultiMap } from "../multiMap";
import { IExposed, IExposing, NodeType, TreeUtils } from "../treeUtils";
import { Utils } from "../utils";
import { SyntaxNodeMap } from "./syntaxNodeMap";
import { Diagnostics, error } from "./diagnostics";

export type SymbolMap = MultiMap<string, ISymbol>;
function createSymbolMap(): SymbolMap {
  return new MultiMap<string, ISymbol>();
}

// TODO: Look at merging ISymbol and IExposed
export interface ISymbol {
  node: SyntaxNode;
  type: NodeType;
}

export function bindTreeContainer(treeContainer: ITreeContainer): void {
  if (treeContainer.symbolLinks) {
    return;
  }

  const symbolLinks = new SyntaxNodeMap<SyntaxNode, SymbolMap>();
  let container: SymbolMap;
  let parent: SyntaxNode;
  const treeCursor = treeContainer.tree.walk();

  bind();
  treeContainer.symbolLinks = symbolLinks;

  // Bind exposing must happen after symbolLinks is bound
  bindExposing();

  function forEachChild(func: () => void): void {
    if (treeCursor.gotoFirstChild()) {
      func();

      while (treeCursor.gotoNextSibling()) {
        func();
      }

      treeCursor.gotoParent();
    }
  }

  function bind(): void {
    const node = treeCursor.currentNode();
    switch (node.type) {
      case "file":
      case "let_in_expr":
      case "anonymous_function_expr":
      case "case_of_branch":
        bindContainer(node);
        break;
      case "value_declaration":
        bindValueDeclaration(node);
        break;
      case "function_declaration_left":
        bindFunctionDeclarationLeft(node);
        break;
      case "type_declaration":
        bindTypeDeclaration(node);
        break;
      case "type_alias_declaration":
        bindTypeAliasDeclaration(node);
        break;
      case "lower_type_name":
        bindLowerTypeName(node);
        break;
      case "port_annotation":
        bindPortAnnotation(node);
        break;
      case "infix_declaration":
        bindInfixDeclaration(node);
        break;
      case "pattern":
        bindPattern(node);
        break;
      case "import_clause":
        bindImportClause(node);
        break;
      case "ERROR":
        treeContainer.parseDiagnostics.push(error(node, Diagnostics.Parsing));
        break;
      default:
        forEachChild(bind);
    }
  }

  function bindContainer(node: SyntaxNode): void {
    const savedContainer = container;
    const savedParent = parent;

    container = createSymbolMap();
    parent = node;

    symbolLinks.set(node, container);

    forEachChild(bind);

    container = savedContainer;
    parent = savedParent;
  }

  function bindValueDeclaration(node: SyntaxNode): void {
    // Bind the function name
    const functionDeclarationLeft = node.childForFieldName(
      "functionDeclarationLeft",
    );

    if (functionDeclarationLeft && functionDeclarationLeft.firstChild) {
      container.set(functionDeclarationLeft.firstChild.text, {
        node: functionDeclarationLeft,
        type: "Function",
      });
    } else {
      // If there is a pattern, bind it to the parent container
      const pattern = node.childForFieldName("pattern");

      if (pattern) {
        pattern.descendantsOfType("lower_pattern").forEach((lowerPattern) => {
          container.set(lowerPattern.text, {
            node: lowerPattern,
            type: "Function", // This isn't a good type
          });
        });
      }
    }

    // Bind the rest of the container
    bindContainer(node);
  }

  function bindFunctionDeclarationLeft(node: SyntaxNode): void {
    node.descendantsOfType("lower_pattern").forEach((lowerPattern) => {
      container.set(lowerPattern.text, {
        node: lowerPattern,
        type: "FunctionParameter",
      });
    });
  }

  function bindTypeDeclaration(node: SyntaxNode): void {
    const name = node.childForFieldName("name");

    if (name) {
      container.set(name.text, { node, type: "Type" });
    }

    // Union variants get bound to the parent container
    TreeUtils.findAllNamedChildrenOfType("union_variant", node)?.forEach(
      (unionVariant) => {
        const name = unionVariant.childForFieldName("name");

        if (name) {
          container.set(name.text, {
            node: unionVariant,
            type: "UnionConstructor",
          });
        }
      },
    );

    // Bind type variables
    bindContainer(node);
  }

  function bindTypeAliasDeclaration(node: SyntaxNode): void {
    const name = node.childForFieldName("name");

    if (name) {
      container.set(name.text, { node, type: "TypeAlias" });
    }

    // Bind type variables
    bindContainer(node);
  }

  function bindLowerTypeName(node: SyntaxNode): void {
    container.set(node.text, { node, type: "TypeVariable" });
  }

  function bindPortAnnotation(node: SyntaxNode): void {
    // TODO: Use field
    const name = TreeUtils.findFirstNamedChildOfType(
      "lower_case_identifier",
      node,
    );

    if (name) {
      container.set(name.text, { node, type: "Port" });
    }
  }

  function bindInfixDeclaration(node: SyntaxNode): void {
    const operator = node.childForFieldName("operator");
    const name = node.lastNamedChild;
    if (operator && name) {
      container.set(operator.text, { node, type: "Operator" });
      container.set(name.text, { node, type: "Operator" });
    }
  }

  function bindPattern(node: SyntaxNode): void {
    node.descendantsOfType("lower_pattern").forEach((lowerPattern) => {
      switch (parent.type) {
        case "anonymous_function_expr":
          container.set(lowerPattern.text, {
            node: lowerPattern,
            type: "AnonymousFunctionParameter",
          });
          break;
        case "case_of_branch":
          container.set(lowerPattern.text, {
            node: lowerPattern,
            type: "CasePattern",
          });
          break;
      }
    });
  }

  function bindImportClause(node: SyntaxNode): void {
    const asClause = node.childForFieldName("asClause");

    let name;
    if (asClause) {
      name = asClause.childForFieldName("name");
    } else {
      name = node.childForFieldName("moduleName");
    }

    if (name) {
      container.set(name.text, { node, type: "Import" });
    }
  }

  function bindExposing(): void {
    const tree = treeContainer.tree;
    const exposed: IExposing = new Map<string, IExposed>();
    const moduleDeclaration = TreeUtils.findModuleDeclaration(tree);
    if (moduleDeclaration) {
      const exposingList = moduleDeclaration.childForFieldName("exposing");
      if (exposingList) {
        const rootSymbols = symbolLinks.get(tree.rootNode);
        if (exposingList.childForFieldName("doubleDot")) {
          rootSymbols?.forEach((symbol) => {
            switch (symbol.type) {
              case "Function":
                {
                  if (symbol.node.firstNamedChild) {
                    const functionName = symbol.node.firstNamedChild.text;
                    exposed.set(functionName, {
                      name: functionName,
                      syntaxNode: symbol.node,
                      type: "Function",
                    });
                  }
                }
                break;

              case "TypeAlias":
                {
                  const name = symbol.node.childForFieldName("name");
                  if (name) {
                    exposed.set(name.text, {
                      name: name.text,
                      syntaxNode: symbol.node,
                      type: "TypeAlias",
                    });
                  }
                }
                break;

              case "Type":
                {
                  const unionConstructors =
                    TreeUtils.findAllNamedChildrenOfType(
                      "union_variant",
                      symbol.node,
                    )
                      ?.map((variant) => {
                        const name = variant.childForFieldName("name");
                        if (name && name.parent) {
                          return {
                            name: name.text,
                            syntaxNode: variant,
                          };
                        }
                      })
                      .filter(Utils.notUndefined.bind(bindExposing)) ?? [];

                  const typeDeclarationName = symbol.node.childForFieldName(
                    "name",
                  );
                  if (typeDeclarationName) {
                    exposed.set(typeDeclarationName.text, {
                      name: typeDeclarationName.text,
                      syntaxNode: symbol.node,
                      type: "Type",
                      exposedUnionConstructors: unionConstructors,
                    });
                  }
                }
                break;

              case "Port":
                {
                  const name = symbol.node.childForFieldName("name")?.text;
                  if (name) {
                    exposed.set(name, {
                      name,
                      syntaxNode: symbol.node,
                      type: "Port",
                    });
                  }
                }
                break;
            }
          });
        } else {
          const exposedOperators = TreeUtils.descendantsOfType(
            exposingList,
            "operator_identifier",
          );

          for (const value of exposedOperators) {
            const functionNode = TreeUtils.findOperator(
              treeContainer,
              value.text,
            );

            if (functionNode) {
              exposed.set(value.text, {
                name: value.text,
                syntaxNode: functionNode,
                type: "Operator",
                exposedUnionConstructors: undefined,
              });
            }
          }

          TreeUtils.descendantsOfType(exposingList, "exposed_value")
            .map((a) => a.text)
            .forEach((exposedValue) => {
              const symbol = rootSymbols?.get(exposedValue);

              if (symbol) {
                exposed.set(exposedValue, {
                  name: exposedValue,
                  syntaxNode: symbol.node,
                  type: symbol.type,
                });
              }
            });

          const exposedTypes = TreeUtils.descendantsOfType(
            exposingList,
            "exposed_type",
          );
          for (const value of exposedTypes) {
            const doubleDot = TreeUtils.descendantsOfType(value, "double_dot");
            if (doubleDot.length > 0) {
              const name = TreeUtils.findFirstNamedChildOfType(
                "upper_case_identifier",
                value,
              );

              if (name) {
                const typeDeclaration = rootSymbols?.get(
                  name.text,
                  (s) => s.type === "Type",
                );
                if (typeDeclaration) {
                  const unionConstructors = TreeUtils.descendantsOfType(
                    typeDeclaration.node,
                    "union_variant",
                  )
                    .map((variant) => {
                      const unionConstructorName = variant.childForFieldName(
                        "name",
                      );
                      if (unionConstructorName && unionConstructorName.parent) {
                        return {
                          name: unionConstructorName.text,
                          syntaxNode: variant,
                        };
                      }
                    })
                    .filter(Utils.notUndefined.bind(bindExposing));

                  exposed.set(name.text, {
                    name: name.text,
                    syntaxNode: typeDeclaration.node,
                    type: "Type",
                    exposedUnionConstructors: unionConstructors,
                  });
                }
              }
            } else {
              const typeNode = rootSymbols?.get(
                value.text,
                (symbol) =>
                  symbol.type === "Type" || symbol.type === "TypeAlias",
              );

              if (typeNode) {
                exposed.set(value.text, {
                  name: value.text,
                  syntaxNode: typeNode.node,
                  type: typeNode.type,
                });
              }
            }
          }
        }
      }
    }

    treeContainer.exposing = exposed;
  }
}
