import { IElmWorkspace } from "../elmWorkspace";
import { ITreeContainer } from "../forest";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { IReferenceNode } from "./referenceNode";
import { TreeUtils } from "./treeUtils";
import { Utils } from "./utils";
import { Imports } from "../imports";

export class References {
  public static find(
    definitionNode: IReferenceNode | undefined,
    elmWorkspace: IElmWorkspace,
  ): { node: SyntaxNode; uri: string }[] {
    const references: { node: SyntaxNode; uri: string }[] = [];

    const forest = elmWorkspace.getForest();
    const checker = elmWorkspace.getTypeChecker();

    if (definitionNode) {
      const refSourceTree = forest.getByUri(definitionNode.uri);

      if (refSourceTree) {
        const imports: { [uri: string]: Imports } = {};
        forest.treeMap.forEach((treeContainer) => {
          imports[treeContainer.uri] = checker.getAllImports(treeContainer);
        });

        const moduleNameNode = TreeUtils.getModuleNameNode(refSourceTree.tree);
        switch (definitionNode.nodeType) {
          case "Function":
            {
              const annotationNameNode = this.getFunctionAnnotationNameNodeFromDefinition(
                definitionNode.node,
              );
              if (annotationNameNode && refSourceTree.writeable) {
                references.push({
                  node: annotationNameNode,
                  uri: definitionNode.uri,
                });
              }

              const functionNameNode = TreeUtils.getFunctionNameNodeFromDefinition(
                definitionNode.node,
              );
              if (functionNameNode) {
                if (refSourceTree.writeable) {
                  references.push({
                    node: functionNameNode,
                    uri: definitionNode.uri,
                  });
                }

                const localFunctions =
                  definitionNode.node.parent?.parent &&
                  definitionNode.node.parent?.parent.type === "let_in_expr" &&
                  definitionNode.node.parent?.parent.lastNamedChild
                    ? this.findFunctionCalls(
                        definitionNode.node.parent.parent.lastNamedChild,
                        functionNameNode.text,
                      )
                    : this.findFunctionCalls(
                        refSourceTree.tree.rootNode,
                        functionNameNode.text,
                      );

                if (localFunctions && refSourceTree.writeable) {
                  references.push(
                    ...localFunctions.map((node) => {
                      return { node, uri: definitionNode.uri };
                    }),
                  );
                }

                const isExposedFunction = TreeUtils.isExposedFunction(
                  refSourceTree.tree,
                  functionNameNode.text,
                );
                if (isExposedFunction) {
                  const moduleDeclarationNode = TreeUtils.findModuleDeclaration(
                    refSourceTree.tree,
                  );
                  if (moduleDeclarationNode) {
                    const exposedNode = TreeUtils.findExposedFunctionNode(
                      moduleDeclarationNode,
                      functionNameNode.text,
                    );

                    if (exposedNode && refSourceTree.writeable) {
                      references.push({
                        node: exposedNode,
                        uri: definitionNode.uri,
                      });
                    }
                  }

                  if (isExposedFunction && moduleNameNode) {
                    for (const uri in imports) {
                      if (uri === definitionNode.uri) {
                        continue;
                      }

                      const element = imports[uri];
                      const found =
                        element.get(functionNameNode.text) ??
                        element.get(
                          `${moduleNameNode.text}.${functionNameNode.text}`,
                        );

                      const needsToBeChecked =
                        found?.fromModuleName === moduleNameNode.text &&
                        found.type === "Function";

                      if (needsToBeChecked && found) {
                        const treeToCheck = forest.getByUri(uri);

                        if (treeToCheck && treeToCheck.writeable) {
                          const importClauseNode = TreeUtils.findImportClauseByName(
                            treeToCheck.tree,
                            moduleNameNode.text,
                          );
                          if (importClauseNode) {
                            const exposedNode = TreeUtils.findExposedFunctionNode(
                              importClauseNode,
                              functionNameNode.text,
                            );

                            if (exposedNode) {
                              references.push({
                                node: exposedNode,
                                uri,
                              });
                            }
                          }

                          const functions = this.findFunctionCalls(
                            treeToCheck.tree.rootNode,
                            found?.alias,
                          );
                          if (functions) {
                            references.push(
                              ...functions.map((node) => {
                                return { node, uri };
                              }),
                            );
                          }
                        }
                      }
                    }
                  }
                }
              }
            }

            break;
          case "Type":
          case "TypeAlias":
            {
              const typeOrTypeAliasNameNode = TreeUtils.getTypeOrTypeAliasNameNodeFromDefinition(
                definitionNode.node,
              );

              if (typeOrTypeAliasNameNode) {
                if (refSourceTree.writeable) {
                  references.push({
                    node: typeOrTypeAliasNameNode,
                    uri: definitionNode.uri,
                  });
                }

                const localFunctions = TreeUtils.findTypeOrTypeAliasCalls(
                  refSourceTree.tree,
                  typeOrTypeAliasNameNode.text,
                );
                if (localFunctions && refSourceTree.writeable) {
                  references.push(
                    ...localFunctions.map((node) => {
                      return { node, uri: definitionNode.uri };
                    }),
                  );
                }

                const isExposed = TreeUtils.isExposedTypeOrTypeAlias(
                  refSourceTree.tree,
                  typeOrTypeAliasNameNode.text,
                );
                if (isExposed) {
                  const moduleDeclarationNode = TreeUtils.findModuleDeclaration(
                    refSourceTree.tree,
                  );
                  if (moduleDeclarationNode) {
                    const exposedNode = TreeUtils.findExposedTypeOrTypeAliasNode(
                      moduleDeclarationNode,
                      typeOrTypeAliasNameNode.text,
                    );

                    if (exposedNode && refSourceTree.writeable) {
                      references.push({
                        node: exposedNode,
                        uri: definitionNode.uri,
                      });
                    }
                  }

                  if (isExposed && moduleNameNode) {
                    for (const uri in imports) {
                      if (uri === definitionNode.uri) {
                        continue;
                      }

                      const element = imports[uri];
                      const found =
                        element.get(typeOrTypeAliasNameNode.text) ??
                        element.get(
                          `${moduleNameNode.text}.${typeOrTypeAliasNameNode.text}`,
                        );

                      const needsToBeChecked =
                        found?.fromModuleName === moduleNameNode.text &&
                        (found.type === "Type" || found.type === "TypeAlias");

                      if (needsToBeChecked && found) {
                        const treeToCheck = forest.getByUri(uri);

                        if (treeToCheck && treeToCheck.writeable) {
                          const importClauseNode = TreeUtils.findImportClauseByName(
                            treeToCheck.tree,
                            moduleNameNode.text,
                          );
                          if (importClauseNode) {
                            const exposedNode = TreeUtils.findExposedTypeOrTypeAliasNode(
                              importClauseNode,
                              typeOrTypeAliasNameNode.text,
                            );

                            if (exposedNode) {
                              references.push({
                                node: exposedNode,
                                uri,
                              });
                            }
                          }

                          const typeOrTypeAliasCalls = TreeUtils.findTypeOrTypeAliasCalls(
                            treeToCheck.tree,
                            found.alias,
                          );
                          if (typeOrTypeAliasCalls) {
                            references.push(
                              ...typeOrTypeAliasCalls.map((node) => {
                                return { node, uri };
                              }),
                            );
                          }
                        }
                      }
                    }
                  }
                }
              }
            }

            break;

          case "Module":
            if (moduleNameNode) {
              if (refSourceTree.writeable) {
                references.push({
                  node: moduleNameNode,
                  uri: definitionNode.uri,
                });
              }

              for (const uri in imports) {
                if (uri === definitionNode.uri) {
                  continue;
                }

                const element = imports[uri];
                const found = element.get(moduleNameNode.text);

                if (found) {
                  const treeToCheck = forest.getByUri(uri);

                  if (treeToCheck && treeToCheck.writeable) {
                    const importNameNode = TreeUtils.findImportNameNode(
                      treeToCheck.tree,
                      found.alias,
                    );
                    if (importNameNode) {
                      references.push({ node: importNameNode, uri });
                    }
                    break;
                  }
                }
              }
            }
            break;

          case "FunctionParameter":
            if (refSourceTree.writeable) {
              references.push({
                node: definitionNode.node,
                uri: definitionNode.uri,
              });

              const valueDeclaration = TreeUtils.findParentOfType(
                "function_declaration_left",
                definitionNode.node,
              );
              if (
                valueDeclaration &&
                valueDeclaration.nextNamedSibling &&
                valueDeclaration.nextNamedSibling.nextNamedSibling
              ) {
                const functionBody =
                  valueDeclaration.nextNamedSibling.nextNamedSibling;
                if (functionBody) {
                  const parameters = this.findParameterUsage(
                    functionBody,
                    definitionNode.node.text,
                  );
                  if (parameters) {
                    references.push(
                      ...parameters.map((node) => {
                        return { node, uri: definitionNode.uri };
                      }),
                    );
                  }
                }
              }
            }
            break;

          case "CasePattern":
            if (refSourceTree.writeable) {
              references.push({
                node: definitionNode.node,
                uri: definitionNode.uri,
              });

              if (
                definitionNode.node.parent &&
                definitionNode.node.parent.parent &&
                definitionNode.node.parent.parent.parent &&
                definitionNode.node.parent.parent.parent.lastNamedChild
              ) {
                const caseBody =
                  definitionNode.node.parent.parent.parent.lastNamedChild;
                if (caseBody) {
                  const parameters = this.findParameterUsage(
                    caseBody,
                    definitionNode.node.text,
                  );
                  if (parameters) {
                    references.push(
                      ...parameters.map((node) => {
                        return { node, uri: definitionNode.uri };
                      }),
                    );
                  }
                }
              }
            }
            break;

          case "AnonymousFunctionParameter":
            if (refSourceTree.writeable) {
              references.push({
                node: definitionNode.node,
                uri: definitionNode.uri,
              });

              if (
                definitionNode.node.parent &&
                definitionNode.node.parent.parent
              ) {
                const anonymousFunction = definitionNode.node.parent.parent; // TODO this is due to tree sitter matching wrong
                if (anonymousFunction) {
                  const parameters = this.findParameterUsage(
                    anonymousFunction,
                    definitionNode.node.text,
                  );
                  if (parameters) {
                    references.push(
                      ...parameters.map((node) => {
                        return { node, uri: definitionNode.uri };
                      }),
                    );
                  }
                }
              }
            }
            break;

          case "UnionConstructor":
            if (definitionNode.node.firstChild && moduleNameNode) {
              const nameNode = definitionNode.node.firstChild;
              if (refSourceTree.writeable) {
                references.push({
                  node: nameNode,
                  uri: definitionNode.uri,
                });
                const unionConstructorCalls = TreeUtils.findUnionConstructorCalls(
                  refSourceTree.tree,
                  nameNode.text,
                );

                if (unionConstructorCalls) {
                  references.push(
                    ...unionConstructorCalls.map((a) => {
                      return { node: a, uri: definitionNode.uri };
                    }),
                  );
                }
              }

              for (const uri in imports) {
                if (uri === definitionNode.uri) {
                  continue;
                }

                const element = imports[uri];
                const found =
                  element.get(nameNode.text) ??
                  element.get(`${moduleNameNode.text}.${nameNode.text}`);

                const needsToBeChecked =
                  found?.fromModuleName === moduleNameNode.text &&
                  found.type === "UnionConstructor";

                if (needsToBeChecked) {
                  const treeToCheck = forest.getByUri(uri);
                  if (treeToCheck && treeToCheck.writeable) {
                    const unionConstructorCallsFromOtherFiles = TreeUtils.findUnionConstructorCalls(
                      treeToCheck.tree,
                      nameNode.text,
                    );
                    if (unionConstructorCallsFromOtherFiles) {
                      references.push(
                        ...unionConstructorCallsFromOtherFiles.map((node) => {
                          return { node, uri };
                        }),
                      );
                    }
                  }
                }
              }
            }
            break;

          case "FieldType":
            {
              const fieldName = definitionNode.node.childForFieldName("name");

              if (fieldName) {
                references.push({
                  node: fieldName,
                  uri: definitionNode.uri,
                });

                references.push(
                  ...this.getFieldReferences(
                    fieldName.text,
                    definitionNode,
                    refSourceTree,
                    elmWorkspace,
                  ),
                );

                for (const uri in imports) {
                  if (uri === definitionNode.uri) {
                    continue;
                  }

                  const needsToBeChecked = forest
                    .getByUri(uri)
                    ?.resolvedModules?.get(moduleNameNode?.text ?? "");

                  if (needsToBeChecked) {
                    const treeToCheck = forest.getByUri(uri);

                    if (treeToCheck && treeToCheck.writeable) {
                      references.push(
                        ...this.getFieldReferences(
                          fieldName.text,
                          definitionNode,
                          treeToCheck,
                          elmWorkspace,
                        ),
                      );
                    }
                  }
                }
              }
            }
            break;

          default:
            break;
        }
      }
    }
    return references;
  }

  public static findOperator(
    node: SyntaxNode,
    elmWorkspace: IElmWorkspace,
  ): SyntaxNode | undefined {
    const functionNameNode = TreeUtils.getFunctionNameNodeFromDefinition(node);

    if (functionNameNode) {
      const infixRef = elmWorkspace
        .getForest()
        .getByUri(node.tree.uri)
        ?.symbolLinks?.get(node.tree.rootNode)
        ?.get(
          functionNameNode.text,
          (s) => s.node.type === "infix_declaration",
        );

      return infixRef?.node;
    }
  }

  private static findFunctionCalls(
    node: SyntaxNode,
    functionName: string,
  ): SyntaxNode[] | undefined {
    const functions = this.findAllFunctionCallsAndParameters(node);
    const result = functions
      .filter((a) => a.text === functionName)
      .map((a) => a.lastChild!);
    return result.length === 0 ? undefined : result;
  }

  private static findAllFunctionCallsAndParameters(
    node: SyntaxNode,
  ): SyntaxNode[] {
    let functions = TreeUtils.descendantsOfType(node, "value_expr");
    if (functions.length > 0) {
      functions = functions
        .filter((a) => a.firstChild && a.firstChild.type === "value_qid")
        .map((a) => a.firstChild!);
    }

    return functions;
  }

  private static findParameterUsage(
    node: SyntaxNode,
    functionName: string,
  ): SyntaxNode[] | undefined {
    const parameters: SyntaxNode[] = [
      ...this.findAllFunctionCallsAndParameters(node),
      ...this.findAllRecordBaseIdentifiers(node),
    ];
    const result = parameters.filter((a) => a.text === functionName);
    return result.length === 0 ? undefined : result;
  }

  private static findAllRecordBaseIdentifiers(node: SyntaxNode): SyntaxNode[] {
    return TreeUtils.descendantsOfType(node, "record_base_identifier");
  }

  private static getFunctionAnnotationNameNodeFromDefinition(
    node: SyntaxNode,
  ): SyntaxNode | undefined {
    if (
      node.parent &&
      node.parent.previousNamedSibling &&
      node.parent.previousNamedSibling.type === "type_annotation" &&
      node.parent.previousNamedSibling.firstChild &&
      node.parent.previousNamedSibling.firstChild.type ===
        "lower_case_identifier"
    ) {
      return node.parent.previousNamedSibling.firstChild;
    }
  }

  private static findFieldUsages(tree: Tree, fieldName: string): SyntaxNode[] {
    return tree.rootNode
      .descendantsOfType([
        "field",
        "field_accessor_function_expr",
        "field_access_expr",
        "record_pattern",
      ])
      .map((field) => {
        if (field.type === "record_pattern") {
          const lowerPattern = field.namedChildren.find(
            (pattern) =>
              pattern.type === "lower_pattern" && pattern.text === fieldName,
          );

          if (lowerPattern) {
            const declaration = TreeUtils.findParentOfType(
              "value_declaration",
              lowerPattern,
            );

            const patternRefs =
              declaration
                ?.descendantsOfType("value_qid")
                .filter((ref) => ref.text === fieldName) ?? [];

            return [lowerPattern, ...patternRefs];
          }
        }

        return [field];
      })
      .reduce((a, b) => a.concat(b), [])
      .map((field) =>
        TreeUtils.findFirstNamedChildOfType("lower_case_identifier", field),
      )
      .filter(Utils.notUndefinedOrNull.bind(this))
      .filter((field) => field.text === fieldName);
  }

  private static getFieldReferences(
    fieldName: string,
    definition: { node: SyntaxNode; uri: string },
    treeContainer: ITreeContainer,
    elmWorkspace: IElmWorkspace,
  ): { node: SyntaxNode; uri: string }[] {
    const references: { node: SyntaxNode; uri: string }[] = [];

    const fieldUsages = References.findFieldUsages(
      treeContainer.tree,
      fieldName,
    );

    fieldUsages.forEach((field) => {
      const fieldDef = elmWorkspace
        .getTypeChecker()
        .findDefinition(field, treeContainer);

      if (fieldDef?.node.id === definition.node.id) {
        references.push({
          node: field,
          uri: treeContainer.uri,
        });
      }
    });

    return references;
  }
}
