import { IForest } from "../forest";

export class ImportUtils {
  public static getPossibleImports(
    forest: IForest,
  ): {
    module: string;
    value: string;
  }[] {
    const exposedValues: {
      module: string;
      value: string;
    }[] = [];

    // Find all exposed values that could be imported
    if (forest) {
      forest.treeIndex.forEach((tree) => {
        tree.exposing?.forEach((exposed) => {
          if (tree.moduleName) {
            exposedValues.push({
              module: tree.moduleName,
              value: exposed.name,
            });
          }
        });
      });
    }

    return exposedValues;
  }
}
