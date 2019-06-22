import Parser, { SyntaxNode, Tree } from "tree-sitter";
import TreeSitterElm from "tree-sitter-elm";
import { IForest, ITreeContainer } from "./forest";
import { Exposing, NodeType, TreeUtils } from "./util/treeUtils";

export interface IImport {
  alias: string;
  node: SyntaxNode;
  fromUri: string;
  fromModuleName: string;
  type: NodeType;
}

export interface IImports {
  imports?: { [uri: string]: IImport[] };
  updateImports(uri: string, tree: Tree, forest: IForest): void;
}

export class Imports implements IImports {
  public imports?: { [uri: string]: IImport[] } = {};
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(TreeSitterElm);
  }

  public updateImports(uri: string, tree: Tree, forest: IForest): void {
    const result: IImport[] = [];
    let importNodes = TreeUtils.findAllNamedChildrenOfType(
      "import_clause",
      tree.rootNode,
    );
    if (importNodes) {
      // Add standard imports
      const virtualImports = this.getVirtualImports();
      if (virtualImports) {
        importNodes = importNodes.concat(virtualImports);
      }

      importNodes.forEach(importNode => {
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
                node: foundModuleNode,
                type: "Module",
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
                      ),
                    );
                  } else {
                    const exposedOperators = exposingList.descendantsOfType(
                      "operator_identifier",
                    );
                    if (exposedOperators.length > 0) {
                      const exposedNodes = exposedFromRemoteModule.filter(
                        element => {
                          return exposedOperators.find(
                            a => a.text === element.name,
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
                        element => {
                          return exposedValues.find(
                            a => a.text === element.name,
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
                        element => {
                          return exposedType.find(a => {
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
    exposed: Exposing,
    uri: string,
  ): IImport[] {
    const result: IImport[] = [];

    const importedAs = this.findImportAsClause(importNode);
    const importPrefix = importedAs ? importedAs : moduleNameNode.text;

    exposed.forEach(element => {
      switch (element.type) {
        case "Function":
        case "TypeAlias":
          result.push({
            alias: `${importPrefix}.${element.name}`,
            fromModuleName: moduleNameNode.text,
            fromUri: uri,
            node: element.syntaxNode,
            type: element.type,
          });
          break;
        case "Type":
          result.push({
            alias: `${importPrefix}.${element.name}`,
            fromModuleName: moduleNameNode.text,
            fromUri: uri,
            node: element.syntaxNode,
            type: element.type,
          });
          if (element.exposedUnionConstructors) {
            result.push(
              ...element.exposedUnionConstructors.map(a => {
                return {
                  alias: `${importPrefix}.${a.name}`,
                  fromModuleName: moduleNameNode.text,
                  fromUri: uri,
                  node: a.syntaxNode,
                  type: "UnionConstructor" as NodeType,
                };
              }),
            );

            result.push(
              ...element.exposedUnionConstructors
                .filter(a => a.accessibleWithoutPrefix)
                .map(a => {
                  return {
                    alias: `${a.name}`,
                    fromModuleName: moduleNameNode.text,
                    fromUri: uri,
                    node: a.syntaxNode,
                    type: "UnionConstructor" as NodeType,
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
    exposed: Exposing,
    moduleName: string,
    uri: string,
  ): IImport[] {
    const result: IImport[] = [];

    exposed.forEach(element => {
      result.push({
        alias: element.name,
        fromModuleName: moduleName,
        fromUri: uri,
        node: element.syntaxNode,
        type: element.type,
      });
    });

    return result;
  }

  private exposedNodesToImports(
    exposedNodes: Array<{
      name: string;
      syntaxNode: Parser.SyntaxNode;
      type: NodeType;
      exposedUnionConstructors?: Array<{
        name: string;
        syntaxNode: Parser.SyntaxNode;
      }>;
    }>,
    moduleNameNode: SyntaxNode,
    foundModule: ITreeContainer,
  ): IImport[] {
    return exposedNodes.map(a => {
      return {
        alias: a.name,
        fromModuleName: moduleNameNode.text,
        fromUri: foundModule.uri,
        node: a.syntaxNode,
        type: a.type,
      };
    });
  }
}
