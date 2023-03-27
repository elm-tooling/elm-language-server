import { comparePackageRanking } from "../providers/ranking";
import { ISourceFile } from "../compiler/forest";
import { TreeUtils, NodeType } from "./treeUtils";
import { SyntaxNode } from "web-tree-sitter";
import { IProgram } from "../compiler/program";

export interface IPossibleImport {
  module: string;
  value: string;
  type: NodeType;
  node: SyntaxNode;
  valueToImport?: string;
  package?: string;
}

export class ImportUtils {
  public static getPossibleImports(
    program: IProgram,
    sourceFile: ISourceFile,
  ): IPossibleImport[] {
    const currentModule = sourceFile?.moduleName;

    const exposedValues: IPossibleImport[] = [];

    // Find all exposed values that could be imported
    program.getImportableModules(sourceFile).forEach(({ uri, moduleName }) => {
      if (uri !== sourceFile.uri && moduleName !== "Basics") {
        const tree = program.getSourceFile(uri);

        if (tree) {
          exposedValues.push(...ImportUtils.getPossibleImportsOfTree(tree));
        }
      }
    });

    exposedValues.sort((a, b) => {
      if (!a.package && b.package) {
        return -1;
      } else if (a.package && !b.package) {
        return 1;
      } else if (a.package && b.package) {
        return comparePackageRanking(a.package, b.package);
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

  public static getPossibleImportsOfTree(tree: ISourceFile): IPossibleImport[] {
    const exposedValues: IPossibleImport[] = [];

    tree.exposing?.forEach((exposed) => {
      const module = tree.moduleName;
      if (module) {
        exposedValues.push({
          module,
          value: exposed.name,
          package: tree.maintainerAndPackageName,
          type: exposed.type,
          node: exposed.node,
        });

        exposed.constructors?.forEach((exp) => {
          if (exp.node.parent && exp.type === "UnionConstructor") {
            const value = exp.node.parent.childForFieldName("name")?.text;

            if (value) {
              exposedValues.push({
                module,
                value: exp.name,
                valueToImport: `${value}(..)`,
                package: tree.maintainerAndPackageName,
                type: "UnionConstructor",
                node: exp.node,
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
