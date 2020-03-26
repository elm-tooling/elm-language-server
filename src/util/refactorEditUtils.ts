import { Position, Range, TextEdit } from "vscode-languageserver";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { TreeUtils } from "./treeUtils";

export class RefactorEditUtils {
  public static unexposedValueInModule(
    tree: Tree,
    valueName: string,
  ): TextEdit | undefined {
    const exposedNodes = TreeUtils.getModuleExposingListNodes(tree);
    return this.removeValueFromExposingList(exposedNodes, valueName);
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
    const lastImportNode = TreeUtils.getLastImportNode(tree);

    if (lastImportNode) {
      return TextEdit.insert(
        Position.create(lastImportNode.endPosition.row + 1, 0),
        valueName
          ? `import ${moduleName} exposing (${valueName})`
          : `import ${moduleName}`,
      );
    }
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
