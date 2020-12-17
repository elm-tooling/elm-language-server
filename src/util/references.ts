import { IElmWorkspace } from "../elmWorkspace";
import { ITreeContainer } from "../forest";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { IReferenceNode } from "./referenceNode";
import { TreeUtils } from "./treeUtils";
import { Utils } from "./utils";
import { IImport, Imports } from "../imports";
import { container } from "tsyringe";

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
                const functionName = functionNameNode.text;
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
                        functionName,
                      )
                    : this.findFunctionCalls(
                        refSourceTree.tree.rootNode,
                        functionName,
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
                  functionName,
                );
                if (isExposedFunction) {
                  const moduleDeclarationNode = TreeUtils.findModuleDeclaration(
                    refSourceTree.tree,
                  );
                  if (moduleDeclarationNode) {
                    const exposedNode = TreeUtils.findExposedFunctionNode(
                      moduleDeclarationNode,
                      functionName,
                    );

                    if (exposedNode && refSourceTree.writeable) {
                      references.push({
                        node: exposedNode,
                        uri: definitionNode.uri,
                      });
                    }
                  }

                  if (isExposedFunction && moduleNameNode) {
                    const moduleName = moduleNameNode.text;

                    for (const uri in imports) {
                      if (uri === definitionNode.uri) {
                        continue;
                      }

                      const otherTreeContainer = forest.getByUri(uri);

                      if (!otherTreeContainer) {
                        continue;
                      }

                      const importedModuleAlias =
                        TreeUtils.findImportAliasOfModule(
                          moduleName,
                          otherTreeContainer.tree,
                        ) ?? moduleName;

                      const element = imports[uri];
                      const filter = (imp: IImport): boolean =>
                        imp.type === "Function" &&
                        imp.fromModuleName === moduleName;

                      // Find the function in the other module's imports
                      const found =
                        element.get(functionName, filter) ??
                        element.get(
                          `${importedModuleAlias}.${functionName}`,
                          filter,
                        );

                      if (found) {
                        if (
                          otherTreeContainer &&
                          otherTreeContainer.writeable
                        ) {
                          const importClause = otherTreeContainer.symbolLinks
                            ?.get(otherTreeContainer.tree.rootNode)
                            ?.get(importedModuleAlias);

                          // Add node from exposing list
                          if (importClause?.type === "Import") {
                            const exposedNode = TreeUtils.findExposedFunctionNode(
                              importClause.node,
                              functionName,
                            );

                            if (exposedNode) {
                              references.push({
                                node: exposedNode,
                                uri,
                              });
                            }
                          }

                          // Find all function calls in the other tree
                          const functions = this.findFunctionCalls(
                            otherTreeContainer.tree.rootNode,
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
                const typeOrTypeAliasName = typeOrTypeAliasNameNode.text;
                if (refSourceTree.writeable) {
                  references.push({
                    node: typeOrTypeAliasNameNode,
                    uri: definitionNode.uri,
                  });
                }

                const localFunctions = TreeUtils.findTypeOrTypeAliasCalls(
                  refSourceTree.tree,
                  typeOrTypeAliasName,
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
                  typeOrTypeAliasName,
                );
                if (isExposed) {
                  const moduleDeclarationNode = TreeUtils.findModuleDeclaration(
                    refSourceTree.tree,
                  );
                  if (moduleDeclarationNode) {
                    const exposedNode = TreeUtils.findExposedTypeOrTypeAliasNode(
                      moduleDeclarationNode,
                      typeOrTypeAliasName,
                    );

                    if (exposedNode && refSourceTree.writeable) {
                      references.push({
                        node: exposedNode,
                        uri: definitionNode.uri,
                      });
                    }
                  }

                  if (isExposed && moduleNameNode) {
                    const moduleName = moduleNameNode.text;
                    for (const uri in imports) {
                      if (uri === definitionNode.uri) {
                        continue;
                      }

                      const otherTreeContainer = forest.getByUri(uri);

                      if (!otherTreeContainer) {
                        continue;
                      }

                      const importedModuleAlias =
                        TreeUtils.findImportAliasOfModule(
                          moduleName,
                          otherTreeContainer.tree,
                        ) ?? moduleName;

                      const element = imports[uri];
                      const filter = (imp: IImport): boolean =>
                        (imp.type === "Type" || imp.type === "TypeAlias") &&
                        imp.fromModuleName === moduleName;

                      // Find the type or type alias in the other module's imports
                      const found =
                        element.get(typeOrTypeAliasName, filter) ??
                        element.get(
                          `${importedModuleAlias}.${typeOrTypeAliasName}`,
                          filter,
                        );

                      if (found) {
                        if (
                          otherTreeContainer &&
                          otherTreeContainer.writeable
                        ) {
                          const importClause = otherTreeContainer.symbolLinks
                            ?.get(otherTreeContainer.tree.rootNode)
                            ?.get(importedModuleAlias);

                          if (importClause?.type === "Import") {
                            const exposedNode = TreeUtils.findExposedTypeOrTypeAliasNode(
                              importClause.node,
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
                            otherTreeContainer.tree,
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

                const sourceFileToCheck = forest.getByUri(uri);

                if (!sourceFileToCheck || !sourceFileToCheck.writeable) {
                  continue;
                }

                const moduleNameToLookFor =
                  TreeUtils.findImportAliasOfModule(
                    moduleNameNode.text,
                    sourceFileToCheck.tree,
                  ) ?? moduleNameNode.text;

                // Check if it is imported
                const imported = sourceFileToCheck.symbolLinks
                  ?.get(sourceFileToCheck.tree.rootNode)
                  ?.get(
                    moduleNameToLookFor,
                    (symbol) => symbol.type === "Import",
                  );

                if (imported) {
                  const importNameNode = checker.findImportModuleNameNode(
                    moduleNameToLookFor,
                    sourceFileToCheck,
                  );

                  if (importNameNode) {
                    references.push({ node: importNameNode, uri });
                  }
                }

                // If it is not imported as an alias, find all references in file
                if (imported && moduleNameToLookFor === moduleNameNode.text) {
                  sourceFileToCheck.tree.rootNode
                    .descendantsOfType("value_expr")
                    .forEach((valueNode) => {
                      if (
                        RegExp(`${moduleNameToLookFor}.[a-z].*`).exec(
                          valueNode.text,
                        )
                      ) {
                        references.push({ node: valueNode, uri });
                      }
                    });
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
