import Parser, { SyntaxNode, Tree } from "web-tree-sitter";
import { IForest, ITreeContainer } from "./forest";
import { IExposing, NodeType, TreeUtils } from "./util/treeUtils";

export interface IImport {
  alias: string;
  node: SyntaxNode;
  fromUri: string;
  fromModuleName: string;
  maintainerAndPackageName?: string;
  type: NodeType;
  explicitlyExposed: boolean; // needed to resolve shadowing of (..) definitions
}

export interface IImports {
  imports?: { [uri: string]: IImport[] };
  updateImports(uri: string, tree: Tree, forest: IForest): void;
}

export class Imports implements IImports {
  public imports?: { [uri: string]: IImport[] } = {};

  constructor(private parser: Parser) {}

  public updateImports(uri: string, tree: Tree, forest: IForest): void {
    const result: IImport[] = [];
    // Add standard imports
    let importNodes = this.getVirtualImports();

    importNodes = importNodes.concat(
      TreeUtils.findAllNamedChildrenOfType("import_clause", tree.rootNode) ??
        [],
    );
    if (importNodes) {
      importNodes.forEach((importNode) => {
        const moduleNameNode = TreeUtils.findFirstNamedChildOfType(
          "upper_case_qid",
          importNode,
        );
        if (moduleNameNode) {
          const foundModule = forest.getByModuleName(moduleNameNode.text);
          if (foundModule) {
            const foundModuleNode = TreeUtils.findModuleDeclaration(
              foundModule.tree,
            );
            if (foundModuleNode) {
              result.push({
                alias: moduleNameNode.text,
                fromModuleName: moduleNameNode.text,
                fromUri: foundModule.uri,
                maintainerAndPackageName: foundModule.maintainerAndPackageName,
                node: foundModuleNode,
                type: "Module",
                explicitlyExposed: false,
              });

              const exposedFromRemoteModule = forest.getExposingByModuleName(
                moduleNameNode.text,
              );
              if (exposedFromRemoteModule) {
                result.push(
                  ...this.getPrefixedCompletions(
                    moduleNameNode,
                    importNode,
                    exposedFromRemoteModule,
                    foundModule.uri,
                    foundModule.maintainerAndPackageName,
                  ),
                );

                const exposingList = TreeUtils.findFirstNamedChildOfType(
                  "exposing_list",
                  importNode,
                );

                if (exposingList) {
                  const doubleDot = TreeUtils.findFirstNamedChildOfType(
                    "double_dot",
                    exposingList,
                  );
                  if (doubleDot) {
                    result.push(
                      ...this.getAllExposedCompletions(
                        exposedFromRemoteModule,
                        moduleNameNode.text,
                        foundModule.uri,
                        foundModule.maintainerAndPackageName,
                      ),
                    );
                  } else {
                    const exposedOperators = TreeUtils.descendantsOfType(
                      exposingList,
                      "operator_identifier",
                    );
                    if (exposedOperators.length > 0) {
                      const exposedNodes = exposedFromRemoteModule.filter(
                        (element) => {
                          return exposedOperators.find(
                            (a) => a.text === element.name,
                          );
                        },
                      );
                      result.push(
                        ...this.exposedNodesToImports(
                          exposedNodes,
                          moduleNameNode,
                          foundModule,
                        ),
                      );
                    }

                    const exposedValues = TreeUtils.findAllNamedChildrenOfType(
                      "exposed_value",
                      exposingList,
                    );
                    if (exposedValues) {
                      const exposedNodes = exposedFromRemoteModule.filter(
                        (element) => {
                          return exposedValues.find(
                            (a) => a.text === element.name,
                          );
                        },
                      );
                      result.push(
                        ...this.exposedNodesToImports(
                          exposedNodes,
                          moduleNameNode,
                          foundModule,
                        ),
                      );
                    }

                    const exposedType = TreeUtils.findAllNamedChildrenOfType(
                      "exposed_type",
                      exposingList,
                    );
                    if (exposedType) {
                      const exposedNodes = exposedFromRemoteModule.filter(
                        (element) => {
                          return exposedType.find((a) => {
                            const typeName = TreeUtils.findFirstNamedChildOfType(
                              "upper_case_identifier",
                              a,
                            );
                            if (typeName) {
                              return typeName.text === element.name;
                            } else {
                              return false;
                            }
                          });
                        },
                      );
                      result.push(
                        ...this.exposedNodesToImports(
                          exposedNodes,
                          moduleNameNode,
                          foundModule,
                        ),
                      );
                    }
                  }
                }
              }
            }
          }
        }
      });
    }
    if (!this.imports) {
      this.imports = {};
    }
    this.imports[uri] = result;
  }

  private getPrefixedCompletions(
    moduleNameNode: SyntaxNode,
    importNode: SyntaxNode,
    exposed: IExposing[],
    uri: string,
    maintainerAndPackageName?: string,
  ): IImport[] {
    const result: IImport[] = [];

    const importedAs = this.findImportAsClause(importNode);
    const importPrefix = importedAs ? importedAs : moduleNameNode.text;

    exposed.forEach((element) => {
      switch (element.type) {
        case "Function":
        case "TypeAlias":
          result.push({
            alias: `${importPrefix}.${element.name}`,
            fromModuleName: moduleNameNode.text,
            fromUri: uri,
            maintainerAndPackageName,
            node: element.syntaxNode,
            type: element.type,
            explicitlyExposed: false,
          });
          break;
        case "Type":
          result.push({
            alias: `${importPrefix}.${element.name}`,
            fromModuleName: moduleNameNode.text,
            fromUri: uri,
            maintainerAndPackageName,
            node: element.syntaxNode,
            type: element.type,
            explicitlyExposed: false,
          });
          if (element.exposedUnionConstructors) {
            result.push(
              ...element.exposedUnionConstructors.map((a) => {
                return {
                  alias: `${importPrefix}.${a.name}`,
                  fromModuleName: moduleNameNode.text,
                  fromUri: uri,
                  maintainerAndPackageName,
                  node: a.syntaxNode,
                  type: "UnionConstructor" as NodeType,
                  explicitlyExposed: false,
                };
              }),
            );

            result.push(
              ...element.exposedUnionConstructors
                .filter((a) => a.accessibleWithoutPrefix)
                .map((a) => {
                  return {
                    alias: `${a.name}`,
                    fromModuleName: moduleNameNode.text,
                    fromUri: uri,
                    maintainerAndPackageName,
                    node: a.syntaxNode,
                    type: "UnionConstructor" as NodeType,
                    explicitlyExposed: false,
                  };
                }),
            );
          }
          break;
        // Do not handle operators, they are not valid if prefixed
      }
    });

    return result;
  }

  private getVirtualImports(): SyntaxNode[] {
    const virtualImports = `
    import Basics exposing (..)
import List exposing (List, (::))
import Maybe exposing (Maybe(..))
import Result exposing (Result(..))
import String exposing (String)
import Char exposing (Char)
import Tuple

import Debug

import Platform exposing ( Program )
import Platform.Cmd as Cmd exposing ( Cmd )
import Platform.Sub as Sub exposing ( Sub )
    `;

    const importTree = this.parser.parse(virtualImports);

    return importTree.rootNode.children;
  }

  private findImportAsClause(importNode: SyntaxNode): string | undefined {
    const asClause = TreeUtils.findFirstNamedChildOfType(
      "as_clause",
      importNode,
    );
    if (asClause) {
      const newName = TreeUtils.findFirstNamedChildOfType(
        "upper_case_identifier",
        asClause,
      );
      if (newName) {
        return newName.text;
      }
    }
  }

  private getAllExposedCompletions(
    exposed: IExposing[],
    moduleName: string,
    uri: string,
    maintainerAndPackageName?: string,
  ): IImport[] {
    return exposed.map((element: IExposing) => {
      return {
        alias: element.name,
        fromModuleName: moduleName,
        fromUri: uri,
        maintainerAndPackageName,
        node: element.syntaxNode,
        type: element.type,
        explicitlyExposed: false,
      };
    });
  }

  private exposedNodesToImports(
    exposedNodes: {
      name: string;
      syntaxNode: Parser.SyntaxNode;
      type: NodeType;
      exposedUnionConstructors?: {
        name: string;
        syntaxNode: Parser.SyntaxNode;
      }[];
    }[],
    moduleNameNode: SyntaxNode,
    foundModule: ITreeContainer,
  ): IImport[] {
    return exposedNodes.map((a) => {
      return {
        alias: a.name,
        fromModuleName: moduleNameNode.text,
        fromUri: foundModule.uri,
        maintainerAndPackageName: foundModule.maintainerAndPackageName,
        node: a.syntaxNode,
        type: a.type,
        explicitlyExposed: true,
      };
    });
  }
}
