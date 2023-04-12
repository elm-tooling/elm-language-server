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
    args: number | string[],
    content: string,
  ): TextEdit {
    return this.createFunction(
      insertLineNumber,
      valueName,
      typeString,
      args,
      content,
    );
  }

  public static createFunction(
    insertLineNumber: number,
    valueName: string,
    typeString: string | undefined,
    args: number | string[],
    content: string,
    contentIndendation = 0,
    targetIndendation = 0,
  ): TextEdit {
    const hasArity0 = args === 0 || (Array.isArray(args) && args.length === 0);
    const argList: string =
      typeof args === "number" ? this.argListFromArity(args) : args.join(" ");

    const bodyTargetIndendation = targetIndendation + 4;
    const spaces = getSpaces(targetIndendation);
    const bodySpaces = getSpaces(bodyTargetIndendation);

    const diffIndentation = bodyTargetIndendation - contentIndendation;

    if (diffIndentation > 0) {
      const diffSpaces = getSpaces(diffIndentation);
      content = content.split("\n").join(`\n${diffSpaces}`);
    } else if (diffIndentation < 0) {
      content = content
        .split("\n")
        .map((line) => {
          let i = 0;
          while (i < Math.abs(diffIndentation) && line[i] === " ") {
            i++;
          }
          return line.slice(i);
        })
        .join("\n");
    }

    if (hasArity0) {
      return TextEdit.insert(
        Position.create(insertLineNumber, 0),
        `\n\n${
          typeString ? `${spaces}${valueName}` + " : " + typeString + "\n" : ""
        }${spaces}${valueName} =\n${bodySpaces}${content}\n`,
      );
    } else {
      return TextEdit.insert(
        Position.create(insertLineNumber, 0),
        `\n\n${
          typeString ? `${spaces}${valueName}` + " : " + typeString + "\n" : ""
        }${spaces}${valueName} ${argList} =\n${bodySpaces}${content}\n`,
      );
    }
  }

  private static argListFromArity(arity: number): string {
    return [...Array(arity).keys()].map((a) => `arg${a + 1}`).join(" ");
  }

  public static exposeValueInModule(
    tree: Tree,
    valueName: string,
    withVariants = false,
  ): TextEdit | undefined {
    const exposedNodes = TreeUtils.getModuleExposingListNodes(tree);

    if (exposedNodes.length > 0) {
      const lastExposedNode = exposedNodes[exposedNodes.length - 1];

      if (withVariants) {
        valueName += "(..)";
      }

      if (exposedNodes.findIndex((n) => n.text === valueName) !== -1) {
        return;
      }

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
    forceRemoveLastComma = false,
  ): TextEdit | undefined {
    const importClause = TreeUtils.findImportClauseByName(tree, moduleName);

    if (importClause) {
      const exposedValuesAndTypes = [
        ...importClause.descendantsOfType(["exposed_value", "exposed_type"]),
      ];

      if (
        exposedValuesAndTypes.length === 1 &&
        exposedValuesAndTypes[0].text === valueName
      ) {
        // Remove the entire exposing list if it was the only one
        const exposingList = TreeUtils.findFirstNamedChildOfType(
          "exposing_list",
          importClause,
        );

        if (exposingList) {
          return TextEdit.del(
            Range.create(
              Position.create(
                exposingList.startPosition.row,
                exposingList.startPosition.column - 1,
              ),
              Position.create(
                exposingList.endPosition.row,
                exposingList.endPosition.column,
              ),
            ),
          );
        }
      } else {
        return this.removeValueFromExposingList(
          exposedValuesAndTypes,
          valueName,
          forceRemoveLastComma,
        );
      }
    }
  }

  public static removeImportExposingList(
    tree: Tree,
    moduleName: string,
  ): TextEdit | undefined {
    const importClause = TreeUtils.findImportClauseByName(tree, moduleName);
    const exposingList = importClause?.childForFieldName("exposing");

    if (exposingList) {
      return TextEdit.del(
        Range.create(
          Position.create(
            exposingList.startPosition.row,
            exposingList.startPosition.column - 1,
          ),
          Position.create(
            exposingList.endPosition.row,
            exposingList.endPosition.column,
          ),
        ),
      );
    }
  }

  public static addImport(
    tree: Tree,
    moduleName: string,
    valueName?: string,
    moduleAlias?: string,
  ): TextEdit | undefined {
    const lastImportNode =
      TreeUtils.getLastImportNode(tree) ??
      TreeUtils.getModuleNameCommentNode(tree) ??
      TreeUtils.getModuleNameNode(tree)?.parent;

    const aliasText =
      moduleAlias && moduleAlias !== moduleName ? ` as ${moduleAlias}` : "";

    return TextEdit.insert(
      Position.create(
        lastImportNode?.endPosition.row
          ? lastImportNode?.endPosition.row + 1
          : 1,
        0,
      ),
      valueName
        ? `import ${moduleName}${aliasText} exposing (${valueName})\n`
        : `import ${moduleName}${aliasText}\n`,
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

  public static removeRecordPatternValue(pattern: SyntaxNode): TextEdit {
    let startPosition = pattern.startPosition;
    let endPosition = pattern.endPosition;

    if (pattern.previousSibling?.text === ",") {
      startPosition = pattern.previousSibling.startPosition;
    }

    if (
      pattern.previousSibling?.text !== "," &&
      pattern.nextSibling?.text === "," &&
      pattern.nextSibling.nextSibling
    ) {
      endPosition = pattern.nextSibling.nextSibling.startPosition;
    }

    return TextEdit.del(
      Range.create(
        Position.create(startPosition.row, startPosition.column),
        Position.create(endPosition.row, endPosition.column),
      ),
    );
  }

  public static removeFunction(
    nodeAtPosition: SyntaxNode,
  ): TextEdit | undefined {
    const valueDeclaration = TreeUtils.findParentOfType(
      "value_declaration",
      nodeAtPosition,
    );

    if (valueDeclaration) {
      let startPosition = valueDeclaration.startPosition;
      const endPosition = valueDeclaration.endPosition;

      if (valueDeclaration.previousSibling?.type === "type_annotation") {
        startPosition = valueDeclaration.previousSibling.startPosition;

        if (
          valueDeclaration.previousSibling?.previousSibling?.type ===
          "block_comment"
        ) {
          startPosition =
            valueDeclaration.previousSibling.previousSibling.startPosition;
        }
      } else if (valueDeclaration.previousSibling?.type === "block_comment") {
        startPosition = valueDeclaration.previousSibling.startPosition;
      }

      return TextEdit.del(
        Range.create(
          Position.create(startPosition.row, startPosition.column),
          Position.create(endPosition.row, endPosition.column),
        ),
      );
    }
  }

  public static removeTypeAlias(node: SyntaxNode | null): TextEdit | undefined {
    if (!node) {
      return undefined;
    }
    const typeAliasDeclarationNode = TreeUtils.findParentOfType(
      "type_alias_declaration",
      node,
    );
    if (!typeAliasDeclarationNode) {
      return undefined;
    }
    return TextEdit.del(
      Range.create(
        Position.create(
          typeAliasDeclarationNode.startPosition.row,
          typeAliasDeclarationNode.startPosition.column,
        ),
        Position.create(
          typeAliasDeclarationNode.endPosition.row,
          typeAliasDeclarationNode.endPosition.column,
        ),
      ),
    );
  }

  public static removeTypeValue(
    nodeAtPosition: SyntaxNode,
  ): TextEdit | undefined {
    const unionVariants = TreeUtils.findParentOfType(
      "type_declaration",
      nodeAtPosition,
    )?.children.filter((child) => child.type == "union_variant");

    if (unionVariants?.length == 1) {
      return this.removeType(unionVariants[0].parent);
    }

    let startPosition = nodeAtPosition.startPosition;
    let endPosition = nodeAtPosition.endPosition;

    const unionVariant = unionVariants?.find(
      (a) =>
        a.text.startsWith(`${nodeAtPosition.text} `) ||
        a.text === nodeAtPosition.text,
    );
    if (unionVariant?.previousSibling?.type == "eq") {
      startPosition = unionVariant.previousSibling?.endPosition;
      if (unionVariant.nextSibling?.type == "|") {
        endPosition = unionVariant.nextSibling?.endPosition;
      }
    } else if (
      unionVariant?.previousSibling?.type == "|" &&
      unionVariant?.previousSibling?.previousSibling
    ) {
      startPosition = unionVariant.previousSibling?.previousSibling.endPosition;
    }

    return TextEdit.del(
      Range.create(
        Position.create(startPosition.row, startPosition.column),
        Position.create(endPosition.row, endPosition.column),
      ),
    );
  }

  public static removeType(node: SyntaxNode | null): TextEdit | undefined {
    if (!node) {
      return undefined;
    }
    const typeDeclarationNode = TreeUtils.findParentOfType(
      "type_declaration",
      node,
    );
    if (!typeDeclarationNode) {
      return undefined;
    }
    return TextEdit.del(
      Range.create(
        Position.create(
          typeDeclarationNode.startPosition.row,
          typeDeclarationNode.startPosition.column,
        ),
        Position.create(
          typeDeclarationNode.endPosition.row,
          typeDeclarationNode.endPosition.column,
        ),
      ),
    );
  }

  public static addUnionVariant(
    typeDeclaration: SyntaxNode,
    name: string,
    params: string[],
  ): TextEdit | undefined {
    const lastUnionVariant = typeDeclaration.lastNamedChild;

    if (lastUnionVariant) {
      // Get the '|' unnamed node
      const spaces = getSpaces(
        lastUnionVariant.previousSibling?.startPosition.column ??
          lastUnionVariant.startPosition.column,
      );
      return TextEdit.insert(
        Position.create(
          lastUnionVariant.endPosition.row,
          lastUnionVariant.endPosition.column,
        ),
        `\n${spaces}| ${name}${params.length > 0 ? " " : ""}${params
          .map((param) => (param.includes(" ") ? `(${param})` : param))
          .join(" ")}`,
      );
    }
  }

  private static removeValueFromExposingList(
    exposedNodes: SyntaxNode[],
    valueName: string,
    forceRemoveLastComma = false,
  ): TextEdit | undefined {
    const exposedNode = exposedNodes.find(
      (node) => node.text === valueName || node.text === `${valueName}(..)`,
    );

    if (exposedNode) {
      let startPosition = exposedNode.startPosition;
      let endPosition = exposedNode.endPosition;

      if (
        exposedNode.previousSibling?.text === "," &&
        (exposedNode.nextSibling?.text === ")" || forceRemoveLastComma)
      ) {
        startPosition = exposedNode.previousSibling.startPosition;
      }

      if (
        exposedNode.nextSibling?.text === "," &&
        exposedNode.nextSibling?.nextSibling
      ) {
        endPosition = exposedNode.nextSibling.nextSibling.startPosition;
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

export function getSpaces(n: number): string {
  return Array(n + 1)
    .map(() => "")
    .join(" ");
}
