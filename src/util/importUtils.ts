import { IForest } from "../forest";
import RANKING_LIST from "../providers/ranking";
import { TreeUtils, NodeType } from "./treeUtils";
import { SyntaxNode, Tree } from "web-tree-sitter";

export class ImportUtils {
  public static getPossibleImports(
    forest: IForest,
    uri: string,
  ): {
    module: string;
    value: string;
    type: NodeType;
    node: SyntaxNode;
    valueToImport?: string;
    package?: string;
  }[] {
    const currentModule = forest.getByUri(uri)?.moduleName;

    const exposedValues: {
      module: string;
      value: string;
      type: NodeType;
      node: SyntaxNode;
      valueToImport?: string;
      package?: string;
    }[] = [];

    // Find all exposed values that could be imported
    if (forest) {
      forest.treeIndex
        .filter(
          (tree) =>
            tree.moduleName !== "Basics" &&
            tree.moduleName !== "Debug" &&
            tree.moduleName !== "Tuple",
        )
        .forEach((tree) => {
          tree.exposing
            ?.filter(
              (exposed) =>
                tree.uri !== uri ||
                !TreeUtils.isValueImported(tree.tree, exposed.name),
            )
            .forEach((exposed) => {
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
