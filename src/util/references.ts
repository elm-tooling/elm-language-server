import { SyntaxNode } from "tree-sitter";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { NodeType, TreeUtils } from "./treeUtils";

export class References {
  public static find(
    definitionNode:
      | { node: SyntaxNode; uri: string; nodeType: NodeType }
      | undefined,
    forest: IForest,
    imports: IImports,
  ): Array<{ node: SyntaxNode; uri: string }> {
    const references: Array<{ node: SyntaxNode; uri: string }> = [];

    if (definitionNode) {
      const refSourceTree = forest.getByUri(definitionNode.uri);

      if (refSourceTree) {
        const moduleNameNode = TreeUtils.getModuleNameNode(refSourceTree.tree);
        switch (definitionNode.nodeType) {
          case "Function":
            const annotationNameNode = TreeUtils.getFunctionAnnotationNameNodeFromDefinition(
              definitionNode.node,
            );
            if (annotationNameNode) {
              if (refSourceTree.writeable) {
                references.push({
                  node: annotationNameNode,
                  uri: definitionNode.uri,
                });
              }
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

              const localFunctions = TreeUtils.findFunctionCalls(
                refSourceTree.tree,
                functionNameNode.text,
              );
              if (localFunctions && refSourceTree.writeable) {
                references.push(
                  ...localFunctions.map(node => {
                    return { node, uri: definitionNode.uri };
                  }),
                );
              }

              if (
                TreeUtils.isExposedFunction(
                  refSourceTree.tree,
                  functionNameNode.text,
                )
              ) {
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

                if (moduleNameNode) {
                  for (const uri in imports.imports) {
                    if (imports.imports.hasOwnProperty(uri)) {
                      const element = imports.imports[uri];
                      const needsToBeChecked = element.filter(
                        a =>
                          a.fromModuleName === moduleNameNode.text &&
                          a.type === "Function" &&
                          (a.alias.endsWith("." + functionNameNode.text) ||
                            a.alias === functionNameNode.text),
                      );
                      if (needsToBeChecked.length > 0) {
                        const treeToCheck = forest.getByUri(uri);

                        if (treeToCheck) {
                          const importClauseNode = TreeUtils.findImportClauseByName(
                            treeToCheck.tree,
                            moduleNameNode.text,
                          );
                          if (importClauseNode) {
                            const exposedNode = TreeUtils.findExposedFunctionNode(
                              importClauseNode,
                              functionNameNode.text,
                            );

                            if (exposedNode && treeToCheck.writeable) {
                              references.push({
                                node: exposedNode,
                                uri,
                              });
                            }
                          }

                          needsToBeChecked.forEach(a => {
                            const functions = TreeUtils.findFunctionCalls(
                              treeToCheck.tree,
                              a.alias,
                            );
                            if (functions && treeToCheck.writeable) {
                              references.push(
                                ...functions.map(node => {
                                  return { node, uri };
                                }),
                              );
                            }
                          });
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
                  ...localFunctions.map(node => {
                    return { node, uri: definitionNode.uri };
                  }),
                );
              }

              if (
                TreeUtils.isExposedTypeOrTypeAlias(
                  refSourceTree.tree,
                  typeOrTypeAliasNameNode.text,
                )
              ) {
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

                if (moduleNameNode) {
                  for (const uri in imports.imports) {
                    if (imports.imports.hasOwnProperty(uri)) {
                      const element = imports.imports[uri];
                      const needsToBeChecked = element.filter(
                        a =>
                          a.fromModuleName === moduleNameNode.text &&
                          (a.type === "Type" || a.type === "TypeAlias") &&
                          (a.alias.endsWith(
                            "." + typeOrTypeAliasNameNode.text,
                          ) ||
                            a.alias === typeOrTypeAliasNameNode.text),
                      );
                      if (needsToBeChecked.length > 0) {
                        const treeToCheck = forest.getByUri(uri);

                        if (treeToCheck) {
                          const importClauseNode = TreeUtils.findImportClauseByName(
                            treeToCheck.tree,
                            moduleNameNode.text,
                          );
                          if (importClauseNode) {
                            const exposedNode = TreeUtils.findExposedTypeOrTypeAliasNode(
                              importClauseNode,
                              typeOrTypeAliasNameNode.text,
                            );

                            if (exposedNode && treeToCheck.writeable) {
                              references.push({
                                node: exposedNode,
                                uri,
                              });
                            }
                          }

                          needsToBeChecked.forEach(a => {
                            const functions = TreeUtils.findTypeOrTypeAliasCalls(
                              treeToCheck.tree,
                              a.alias,
                            );
                            if (functions && treeToCheck.writeable) {
                              references.push(
                                ...functions.map(node => {
                                  return { node, uri };
                                }),
                              );
                            }
                          });
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

              for (const uri in imports.imports) {
                if (imports.imports.hasOwnProperty(uri)) {
                  const element = imports.imports[uri];
                  const needsToBeChecked = element.filter(
                    a => a.fromModuleName === moduleNameNode.text,
                  );
                  if (needsToBeChecked.length > 0) {
                    const treeToCheck = forest.getByUri(uri);

                    if (treeToCheck) {
                      needsToBeChecked.forEach(a => {
                        const importNameNode = TreeUtils.findImportNameNode(
                          treeToCheck.tree,
                          a.alias,
                        );
                        if (importNameNode && treeToCheck.writeable) {
                          references.push({ node: importNameNode, uri });
                        }
                      });
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
}
