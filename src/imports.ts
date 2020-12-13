import Parser, { SyntaxNode } from "web-tree-sitter";
import { IForest, ITreeContainer } from "./forest";
import { IExposed, IExposing, NodeType, TreeUtils } from "./util/treeUtils";
import { container } from "tsyringe";
import { MultiMap } from "./util/multiMap";
import { performance } from "perf_hooks";
import { URI } from "vscode-uri";

export let importsTime = 0;
export function resetImportsTime(): void {
  importsTime = 0;
}

export interface IImport {
  alias: string;
  node: SyntaxNode;
  fromUri: URI;
  fromModuleName: string;
  maintainerAndPackageName?: string;
  type: NodeType;
  explicitlyExposed: boolean; // needed to resolve shadowing of (..) definitions
}

/**
 * Imports class that extends a map to handle multiple named imports
 */
export class Imports extends MultiMap<string, IImport> {
  public get(
    key: string,
    filter?: (val: IImport) => boolean,
  ): IImport | undefined {
    return super.get(key, filter, (a) => (a.explicitlyExposed ? -1 : 1));
  }
  private static cachedVirtualImports: SyntaxNode[];

  public static getImports(
    treeContainer: ITreeContainer,
    forest: IForest,
  ): Imports {
    const start = performance.now();
    const result = new Imports();

    const importNodes = [
      ...Imports.getVirtualImports(),
      ...(TreeUtils.findAllImportClauseNodes(treeContainer.tree) ?? []),
    ];

    importNodes.forEach((importNode) => {
      const moduleName = importNode.childForFieldName("moduleName")?.text;
      if (moduleName) {
        const uri = treeContainer.resolvedModules?.get(moduleName);

        if (!uri) {
          return;
        }

        const foundModule = forest.getByUri(uri);
        if (foundModule) {
          const foundModuleNode = TreeUtils.findModuleDeclaration(
            foundModule.tree,
          );
          if (foundModuleNode) {
            result.set(moduleName, {
              alias: moduleName,
              fromModuleName: moduleName,
              fromUri: uri,
              maintainerAndPackageName: foundModule.maintainerAndPackageName,
              node: foundModuleNode,
              type: "Module",
              explicitlyExposed: false,
            });

            const exposedFromRemoteModule = foundModule.exposing;
            if (exposedFromRemoteModule) {
              this.getPrefixedImports(
                moduleName,
                importNode,
                exposedFromRemoteModule,
                foundModule.uri,
                foundModule.maintainerAndPackageName,
              ).forEach((imp) => result.set(imp.alias, imp));

              const exposingList = importNode.childForFieldName("exposing");

              if (exposingList) {
                const doubleDot = exposingList.childForFieldName("doubleDot");
                if (doubleDot) {
                  this.getAllExposedCompletions(
                    exposedFromRemoteModule,
                    moduleName,
                    foundModule.uri,
                    foundModule.maintainerAndPackageName,
                  ).forEach((imp) => result.set(imp.alias, imp));
                } else {
                  const exposedOperators = TreeUtils.descendantsOfType(
                    exposingList,
                    "operator_identifier",
                  );
                  exposedOperators.forEach((exposedOperator) => {
                    const foundNode = exposedFromRemoteModule.get(
                      exposedOperator.text,
                    );
                    if (foundNode) {
                      this.exposedNodesToImports(
                        foundNode,
                        moduleName,
                        foundModule,
                      ).forEach((imp) => result.set(imp.alias, imp));
                    }
                  });

                  const exposedValues = TreeUtils.findAllNamedChildrenOfType(
                    "exposed_value",
                    exposingList,
                  );
                  exposedValues?.forEach((exposedValue) => {
                    const foundNode = exposedFromRemoteModule.get(
                      exposedValue.text,
                    );
                    if (foundNode) {
                      this.exposedNodesToImports(
                        foundNode,
                        moduleName,
                        foundModule,
                      ).forEach((imp) => result.set(imp.alias, imp));
                    }
                  });

                  const exposedTypes = TreeUtils.findAllNamedChildrenOfType(
                    "exposed_type",
                    exposingList,
                  );

                  exposedTypes?.forEach((exposedType) => {
                    const typeName = TreeUtils.findFirstNamedChildOfType(
                      "upper_case_identifier",
                      exposedType,
                    )?.text;

                    const exposedUnionConstructors = !!TreeUtils.findFirstNamedChildOfType(
                      "exposed_union_constructors",
                      exposedType,
                    );

                    if (typeName) {
                      const foundNode = exposedFromRemoteModule.get(typeName);
                      if (foundNode) {
                        this.exposedNodesToImports(
                          foundNode,
                          moduleName,
                          foundModule,
                          exposedUnionConstructors,
                        ).forEach((imp) => result.set(imp.alias, imp));
                      }
                    }
                  });
                }
              }
            }
          }
        }
      }
    });

    importsTime += performance.now() - start;

    return result;
  }

  private static getPrefixedImports(
    moduleName: string,
    importNode: SyntaxNode,
    exposed: IExposing,
    uri: URI,
    maintainerAndPackageName?: string,
  ): IImport[] {
    const result: IImport[] = [];

    const importedAs = this.findImportAsClause(importNode);
    const importPrefix = importedAs ? importedAs : moduleName;

    exposed.forEach((element, name) => {
      switch (element.type) {
        case "Function":
        case "Port":
        case "TypeAlias":
          result.push({
            alias: `${importPrefix}.${name}`,
            fromModuleName: moduleName,
            fromUri: uri,
            maintainerAndPackageName,
            node: element.syntaxNode,
            type: element.type,
            explicitlyExposed: false,
          });
          break;
        case "Type":
          result.push({
            alias: `${importPrefix}.${name}`,
            fromModuleName: moduleName,
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
                  fromModuleName: moduleName,
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

  public static getVirtualImports(): SyntaxNode[] {
    if (this.cachedVirtualImports) {
      return this.cachedVirtualImports;
    }

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

    const parser = container.resolve<Parser>("Parser");
    const importTree = parser.parse(virtualImports);

    return (this.cachedVirtualImports = importTree.rootNode.children);
  }

  private static findImportAsClause(
    importNode: SyntaxNode,
  ): string | undefined {
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

  private static getAllExposedCompletions(
    exposed: IExposing,
    moduleName: string,
    uri: URI,
    maintainerAndPackageName?: string,
  ): IImport[] {
    const result: IImport[] = [];

    // These need to be added additionally, as they are nested
    Array.from(exposed.values())
      .filter((it) => it.type === "Type")
      .forEach((element) => {
        if (element.exposedUnionConstructors) {
          result.push(
            ...element.exposedUnionConstructors.map((a) => {
              return {
                alias: `${a.name}`,
                fromModuleName: moduleName,
                fromUri: uri,
                maintainerAndPackageName,
                node: a.syntaxNode,
                type: "UnionConstructor" as NodeType,
                explicitlyExposed: false,
              };
            }),
          );
        }
      });

    return [
      ...result,
      ...Array.from(exposed.values()).map((element) => {
        return {
          alias: element.name,
          fromModuleName: moduleName,
          fromUri: uri,
          maintainerAndPackageName,
          node: element.syntaxNode,
          type: element.type,
          explicitlyExposed: false,
        };
      }),
    ];
  }

  private static exposedNodesToImports(
    exposedNode: IExposed,
    moduleName: string,
    foundModule: ITreeContainer,
    includeUnionConstructors = false,
  ): IImport[] {
    return [
      {
        alias: exposedNode.name,
        fromModuleName: moduleName,
        fromUri: foundModule.uri,
        maintainerAndPackageName: foundModule.maintainerAndPackageName,
        node: exposedNode.syntaxNode,
        type: exposedNode.type,
        explicitlyExposed: true,
      },
    ].concat(
      includeUnionConstructors
        ? exposedNode.exposedUnionConstructors?.map((b) => {
            return {
              alias: b.name,
              fromModuleName: moduleName,
              fromUri: foundModule.uri,
              maintainerAndPackageName: foundModule.maintainerAndPackageName,
              node: b.syntaxNode,
              type: "UnionConstructor",
              explicitlyExposed: false,
            };
          }) ?? []
        : [],
    );
  }
}
