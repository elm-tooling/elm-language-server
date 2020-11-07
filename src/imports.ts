import Parser, { SyntaxNode } from "web-tree-sitter";
import { IForest, ITreeContainer } from "./forest";
import { IExposed, IExposing, NodeType, TreeUtils } from "./util/treeUtils";
import { container } from "tsyringe";

export interface IImport {
  alias: string;
  node: SyntaxNode;
  fromUri: string;
  fromModuleName: string;
  maintainerAndPackageName?: string;
  type: NodeType;
  explicitlyExposed: boolean; // needed to resolve shadowing of (..) definitions
}

/**
 * Imports class that extends a map to handle multiple named imports
 */
export class Imports extends Map<string, IImport | IImport[]> {
  public get(
    key: string,
    filter?: (val: IImport) => boolean,
  ): IImport | undefined {
    let found = super.get(key);

    if (!found) {
      return;
    }

    if (Array.isArray(found)) {
      found = (filter ? found.filter(filter) : found).sort((a) =>
        a.explicitlyExposed ? -1 : 1,
      )[0];
    }

    if (found && (!filter || filter(found))) {
      return found;
    }
  }

  public set(key: string, val: IImport): this {
    if (super.has(key)) {
      const existing = super.get(key);

      if (Array.isArray(existing)) {
        existing.push(val);
      } else if (existing) {
        super.set(key, [existing, val]);
      }
    } else {
      super.set(key, val);
    }
    return this;
  }

  public forEach(
    callbackfn: (
      value: IImport,
      key: string,
      map: Map<string, IImport | IImport[]>,
    ) => void,
  ): void {
    super.forEach((val, key, map) => {
      if (Array.isArray(val)) {
        val.forEach((v) => callbackfn(v, key, map));
      } else {
        callbackfn(val, key, map);
      }
    });
  }

  private static cachedVirtualImports: SyntaxNode[];

  public static getImports(
    treeContainer: ITreeContainer,
    forest: IForest,
  ): Imports {
    const result = new Imports();

    const importNodes = [
      ...Imports.getVirtualImports(),
      ...(TreeUtils.findAllImportClauseNodes(treeContainer.tree) ?? []),
    ];

    importNodes.forEach((importNode) => {
      const moduleName = TreeUtils.findFirstNamedChildOfType(
        "upper_case_qid",
        importNode,
      )?.text;

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
                        [foundNode],
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
                        [foundNode],
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

                    if (typeName) {
                      const foundNode = exposedFromRemoteModule.get(typeName);
                      if (foundNode) {
                        this.exposedNodesToImports(
                          [foundNode],
                          moduleName,
                          foundModule,
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

    return result;
  }

  private static getPrefixedImports(
    moduleName: string,
    importNode: SyntaxNode,
    exposed: IExposing,
    uri: string,
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
    uri: string,
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
    exposedNodes: IExposed[],
    moduleName: string,
    foundModule: ITreeContainer,
  ): IImport[] {
    return exposedNodes
      .map((a) => {
        return [
          {
            alias: a.name,
            fromModuleName: moduleName,
            fromUri: foundModule.uri,
            maintainerAndPackageName: foundModule.maintainerAndPackageName,
            node: a.syntaxNode,
            type: a.type,
            explicitlyExposed: true,
          },
        ].concat(
          a.exposedUnionConstructors?.map((b) => {
            return {
              alias: b.name,
              fromModuleName: moduleName,
              fromUri: foundModule.uri,
              maintainerAndPackageName: foundModule.maintainerAndPackageName,
              node: b.syntaxNode,
              type: "UnionConstructor",
              explicitlyExposed: false,
            };
          }) ?? [],
        );
      })
      .reduce((a, b) => a.concat(b), []);
  }
}
