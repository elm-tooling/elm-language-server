import { IForest, ITreeContainer } from "../forest";
import RANKING_LIST from "../providers/ranking";
import { TreeUtils, NodeType } from "./treeUtils";
import { SyntaxNode } from "web-tree-sitter";

interface IPossibleImport {
  module: string;
  value: string;
  type: NodeType;
  node: SyntaxNode;
  valueToImport?: string;
  package?: string;
}

export class ImportUtils {
  public static getPossibleImportsFiltered(
    forest: IForest,
    uri: string,
    filterText: string,
  ): IPossibleImport[] {
    const currentTree = forest.getTree(uri);

    if (currentTree) {
      const allImportedValues = TreeUtils.getAllImportedValues(
        forest,
        currentTree,
      );

      // Filter out already imported values
      // Then sort by startsWith filter text, then matches filter text
      return this.getPossibleImports(forest, uri)
        .filter(
          (possibleImport) =>
            !allImportedValues.find(
              (importedValue) =>
                importedValue.module === possibleImport.module &&
                importedValue.value ===
                  (possibleImport.valueToImport ?? possibleImport.value),
            ),
        )
        .sort((a, b) => {
          const aValue = (a.valueToImport ?? a.value).toLowerCase();
          const bValue = (b.valueToImport ?? b.value).toLowerCase();

          filterText = filterText.toLowerCase();

          const aStartsWith = aValue.startsWith(filterText);
          const bStartsWith = bValue.startsWith(filterText);

          if (aStartsWith && !bStartsWith) {
            return -1;
          } else if (!aStartsWith && bStartsWith) {
            return 1;
          } else {
            const regex = new RegExp(filterText);
            const aMatches = regex.exec(aValue);
            const bMatches = regex.exec(bValue);

            if (aMatches && !bMatches) {
              return -1;
            } else if (!aMatches && bMatches) {
              return 1;
            } else {
              return 0;
            }
          }
        });
    }

    return [];
  }

  public static getPossibleImports(
    forest: IForest,
    uri: string,
  ): IPossibleImport[] {
    const currentModule = forest.getByUri(uri)?.moduleName;

    const exposedValues: IPossibleImport[] = [];

    // Find all exposed values that could be imported
    if (forest) {
      forest.treeIndex
        .filter(
          (tree) =>
            tree.moduleName !== "Basics" &&
            tree.moduleName !== "Debug" &&
            tree.moduleName !== "Tuple" &&
            tree.uri !== uri,
        )
        .forEach((tree) => {
          exposedValues.push(...ImportUtils.getPossibleImportsOfTree(tree));
        });
    }

    const ranking = RANKING_LIST as {
      [index: string]: string | undefined;
    };

    exposedValues.sort((a, b) => {
      if (!a.package && b.package) {
        return -1;
      } else if (a.package && !b.package) {
        return 1;
      } else if (a.package && b.package) {
        const aRanking = ranking[a.package];
        const bRanking = ranking[b.package];

        if (aRanking && bRanking) {
          return aRanking.localeCompare(bRanking);
        } else if (aRanking) {
          return 1;
        } else if (bRanking) {
          return -1;
        } else {
          return 0;
        }
      } else {
        if (!currentModule) {
          return 0;
        }

        // Sort packages that are in closest to the current module first
        const aScore = this.comparisonScore(currentModule, a.module);
        const bScore = this.comparisonScore(currentModule, b.module);

        if (aScore > bScore) {
          return -1;
        } else if (bScore > aScore) {
          return 1;
        } else {
          return 0;
        }
      }
    });

    return exposedValues;
  }

  public static getPossibleImportsOfTree(
    tree: ITreeContainer,
  ): IPossibleImport[] {
    const exposedValues: IPossibleImport[] = [];

    tree.exposing?.forEach((exposed) => {
      const module = tree.moduleName;
      if (module) {
        exposedValues.push({
          module,
          value: exposed.name,
          package: tree.maintainerAndPackageName,
          type: exposed.type,
          node: exposed.syntaxNode,
        });

        exposed.exposedUnionConstructors?.forEach((exp) => {
          if (exp.syntaxNode.parent) {
            const value = TreeUtils.findFirstNamedChildOfType(
              "upper_case_identifier",
              exp.syntaxNode.parent,
            )?.text;

            if (value) {
              exposedValues.push({
                module,
                value: exp.name,
                valueToImport: `${value}(..)`,
                package: tree.maintainerAndPackageName,
                type: "UnionConstructor",
                node: exp.syntaxNode,
              });
            }
          }
        });
      }
    });

    return exposedValues;
  }

  private static comparisonScore(source: string, target: string): number {
    let score = 0;
    while (
      score < Math.min(source.length, target.length) &&
      source.charAt(score) === target.charAt(score)
    ) {
      score++;
    }

    return score;
  }
}
