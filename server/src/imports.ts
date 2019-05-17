import Parser, { SyntaxNode, Tree } from "tree-sitter";
import TreeSitterElm from "tree-sitter-elm";
import { IForest } from "./forest";
import { Exposing, NodeType, TreeUtils } from "./util/treeUtils";

export interface IImport {
  alias: string;
  node: SyntaxNode | undefined;
  fromModuleName: string;
  type: NodeType;
  uri: string;
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
    let importNodes = TreeUtils.findAllNamedChildsOfType(
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
            result.push({
              alias: moduleNameNode.text,
              fromModuleName: moduleNameNode.text,
              node: TreeUtils.findModule(foundModule.tree),
              type: "Module",
              uri: foundModule.uri,
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
                      ...exposedNodes.map(a => {
                        return {
                          alias: a.name,
                          fromModuleName: moduleNameNode.text,
                          node: a.syntaxNode,
                          type: a.type,
                          uri: foundModule.uri,
                        };
                      }),
                    );
                  }

                  const exposedValues = TreeUtils.findAllNamedChildsOfType(
                    "exposed_value",
                    exposingList,
                  );
                  if (exposedValues) {
                    const exposedNodes = exposedFromRemoteModule.filter(
                      element => {
                        return exposedValues.find(a => a.text === element.name);
                      },
                    );
                    result.push(
                      ...exposedNodes.map(a => {
                        return {
                          alias: a.name,
                          fromModuleName: moduleNameNode.text,
                          node: a.syntaxNode,
                          type: a.type,
                          uri: foundModule.uri,
                        };
                      }),
                    );
                  }

                  const exposedType = TreeUtils.findAllNamedChildsOfType(
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
                      ...exposedNodes.map(a => {
                        return {
                          alias: a.name,
                          fromModuleName: moduleNameNode.text,
                          node: a.syntaxNode,
                          type: a.type,
                          uri: foundModule.uri,
                        };
                      }),
                    );
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
        case "Type":
          result.push({
            alias: importPrefix + "." + element.name,
            fromModuleName: moduleNameNode.text,
            node: element.syntaxNode,
            type: element.type,
            uri,
          });
          if (element.exposedUnionConstructors) {
            result.push(
              ...element.exposedUnionConstructors.map(a => {
                return {
                  alias: importPrefix + "." + a,
                  fromModuleName: moduleNameNode.text,
                  node: undefined,
                  type: "UnionConstructor" as NodeType,
                  uri,
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
        node: element.syntaxNode,
        type: element.type,
        uri,
      });
    });

    return result;
  }
}
