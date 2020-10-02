import { Position, Range, TextEdit } from "vscode-languageserver";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { TreeUtils } from "./treeUtils";

export class RefactorEditUtils {
  public static findLineNumberAfterCurrentFunction(
    nodeAtPosition: SyntaxNode,
  ): number | undefined {
    if (!nodeAtPosition.parent) {
      return undefined;
    }

    if (nodeAtPosition.parent?.type === "file") {
      return nodeAtPosition.endPosition.row + 1;
    }

    return this.findLineNumberAfterCurrentFunction(nodeAtPosition.parent);
  }
  public static unexposedValueInModule(
    tree: Tree,
    valueName: string,
  ): TextEdit | undefined {
    const exposedNodes = TreeUtils.getModuleExposingListNodes(tree);

    if (exposedNodes.length <= 1) {
      // We can't remove the last exposed one and removing the whole module annotation would just lead to elm-format readding it
      return undefined;
    } else {
      return this.removeValueFromExposingList(exposedNodes, valueName);
    }
  }

  public static createTopLevelFunction(
    insertLineNumber: number,
    valueName: string,
    typeString: string | undefined,
    valueExpression: SyntaxNode,
  ): TextEdit | undefined {
    const arity = valueExpression.namedChildCount - 1;
    const hasArity0 = arity == 0;
    const argList: string = this.argListFromArity(arity);

    if (hasArity0) {
      return TextEdit.insert(
        Position.create(insertLineNumber, 0),
        `\n\n${
          typeString ? valueName + " : " + typeString + "\n" : ""
        }${valueName} =\n    Debug.todo "TODO"\n`,
      );
    } else {
      return TextEdit.insert(
        Position.create(insertLineNumber, 0),
        `\n\n${
          typeString ? valueName + " : " + typeString + "\n" : ""
        }${valueName} ${argList} =\n    Debug.todo "TODO"\n`,
      );
    }
  }

  private static argListFromArity(arity: number): string {
    return [...Array(arity).keys()].map((a) => `arg${a + 1}`).join(" ");
  }

  public static exposeValueInModule(
    tree: Tree,
    valueName: string,
  ): TextEdit | undefined {
    const exposedNodes = TreeUtils.getModuleExposingListNodes(tree);

    if (exposedNodes.length > 0) {
      const lastExposedNode = exposedNodes[exposedNodes.length - 1];

      if (lastExposedNode) {
        return TextEdit.insert(
          Position.create(
            lastExposedNode.endPosition.row,
            lastExposedNode.endPosition.column,
          ),
          `, ${valueName}`,
        );
      }
    }
  }

  public static removeValueFromImport(
    tree: Tree,
    moduleName: string,
    valueName: string,
  ): TextEdit | undefined {
    const importClause = TreeUtils.findImportClauseByName(tree, moduleName);

    if (importClause) {
      const exposedValues = TreeUtils.descendantsOfType(
        importClause,
        "exposed_value",
      );

      if (exposedValues.length === 1 && exposedValues[0].text === valueName) {
        // Remove the entire import if it was the only one
        return TextEdit.del(
          Range.create(
            Position.create(
              importClause.startPosition.row,
              importClause.startPosition.column,
            ),
            Position.create(
              importClause.endPosition.row,
              importClause.endPosition.column,
            ),
          ),
        );
      } else {
        return this.removeValueFromExposingList(exposedValues, valueName);
      }
    }
  }

  public static addImport(
    tree: Tree,
    moduleName: string,
    valueName?: string,
  ): TextEdit | undefined {
    const lastImportNode =
      TreeUtils.getLastImportNode(tree) ??
      TreeUtils.getModuleNameNode(tree)?.parent;

    return TextEdit.insert(
      Position.create(
        lastImportNode?.endPosition.row
          ? lastImportNode?.endPosition.row + 1
          : 1,
        0,
      ),
      valueName
        ? `import ${moduleName} exposing (${valueName})\n`
        : `import ${moduleName}\n`,
    );
  }

  public static changeQualifiedReferenceModule(
    node: SyntaxNode,
    newModuleName: string,
  ): TextEdit | undefined {
    if (node.parent && node.parent.type === "value_qid") {
      const moduleNode = TreeUtils.findFirstNamedChildOfType(
        "upper_case_identifier",
        node.parent,
      );

      if (moduleNode) {
        return TextEdit.replace(
          Range.create(
            Position.create(
              moduleNode.startPosition.row,
              moduleNode.startPosition.column,
            ),
            Position.create(
              moduleNode.endPosition.row,
              moduleNode.endPosition.column,
            ),
          ),
          newModuleName,
        );
      }
    }
  }

  public static removeQualifiedReference(
    node: SyntaxNode,
  ): TextEdit | undefined {
    if (node.parent && node.parent.type === "value_qid") {
      const moduleNode = TreeUtils.findFirstNamedChildOfType(
        "upper_case_identifier",
        node.parent,
      );

      if (moduleNode) {
        return TextEdit.del(
          Range.create(
            Position.create(
              moduleNode.startPosition.row,
              moduleNode.startPosition.column,
            ),
            Position.create(
              moduleNode.endPosition.row,
              moduleNode.endPosition.column + 1,
            ),
          ),
        );
      }
    }
  }

  public static addImports(
    tree: Tree,
    importData: {
      moduleName: string;
      valueName?: string;
    }[],
  ): TextEdit | undefined {
    const lastImportNode =
      TreeUtils.getLastImportNode(tree) ??
      TreeUtils.getModuleNameNode(tree)?.parent;

    const imports = importData
      .filter(
        (data, i, array) =>
          array.findIndex(
            (d) =>
              d.moduleName === data.moduleName &&
              d.valueName === data.valueName,
          ) === i,
      )
      .map((data) =>
        data.valueName
          ? `import ${data.moduleName} exposing (${data.valueName})`
          : `import ${data.moduleName}`,
      )
      .join("\n")
      .concat("\n");

    return TextEdit.insert(
      Position.create(
        lastImportNode?.endPosition.row
          ? lastImportNode?.endPosition.row + 1
          : 1,
        0,
      ),
      imports,
    );
  }

  public static addModuleDeclaration(moduleName: string): TextEdit {
    return TextEdit.insert(
      Position.create(0, 0),
      `module ${moduleName} exposing (..)`,
    );
  }

  public static renameModuleDeclaration(
    tree: Tree,
    newModuleName: string,
  ): TextEdit | undefined {
    const moduleNameNode = TreeUtils.getModuleNameNode(tree);
    if (moduleNameNode) {
      return TextEdit.replace(
        Range.create(
          Position.create(
            moduleNameNode.startPosition.row,
            moduleNameNode.startPosition.column,
          ),
          Position.create(
            moduleNameNode.endPosition.row,
            moduleNameNode.endPosition.column,
          ),
        ),
        newModuleName,
      );
    }
  }

  private static removeValueFromExposingList(
    exposedNodes: SyntaxNode[],
    valueName: string,
  ): TextEdit | undefined {
    const exposedNode = exposedNodes.find(
      (node) => node.text === valueName || node.text === `${valueName}(..)`,
    );

    if (exposedNode) {
      let startPosition = exposedNode.startPosition;
      let endPosition = exposedNode.endPosition;

      if (exposedNode.previousNamedSibling?.text === ",") {
        startPosition = exposedNode.previousNamedSibling.startPosition;
      }

      if (
        exposedNode.previousNamedSibling?.text !== "," &&
        exposedNode.nextNamedSibling?.text === ","
      ) {
        endPosition = exposedNode.nextNamedSibling.endPosition;
      }

      return TextEdit.del(
        Range.create(
          Position.create(startPosition.row, startPosition.column),
          Position.create(endPosition.row, endPosition.column),
        ),
      );
    }
  }
}
