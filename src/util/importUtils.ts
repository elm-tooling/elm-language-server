import { IForest } from "../forest";
import RANKING_LIST from "../providers/ranking";
import { TreeUtils } from "./treeUtils";

export class ImportUtils {
  public static getPossibleImports(
    forest: IForest,
  ): {
    module: string;
    value: string;
    valueToImport?: string;
    package?: string;
  }[] {
    const exposedValues: {
      module: string;
      value: string;
      valueToImport?: string;
      package?: string;
    }[] = [];

    // Find all exposed values that could be imported
    if (forest) {
      forest.treeIndex.forEach((tree) => {
        tree.exposing?.forEach((exposed) => {
          const module = tree.moduleName;
          if (module) {
            exposedValues.push({
              module,
              value: exposed.name,
              package: tree.maintainerAndPackageName,
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
                  });
                }
              }
            });
          }
        });
      });
    }

    const ranking = RANKING_LIST as {
      [index: string]: string;
    };

    exposedValues.sort((a, b) => {
      if (!a.package && b.package) {
        return -1;
      } else if (a.package && !b.package) {
        return 1;
      } else if (a.package && b.package) {
        return ranking[a.package].localeCompare(ranking[b.package]);
      } else {
        return 0;
      }
    });

    return exposedValues;
  }
}
