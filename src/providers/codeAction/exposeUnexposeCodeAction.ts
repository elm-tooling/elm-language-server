import { CodeActionKind } from "vscode-languageserver";
import { TextEdit } from "vscode-languageserver-textdocument";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import {
  CodeActionProvider,
  IRefactorCodeAction,
  IRefactorEdit,
} from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";

const refactorName = "expose_unexpose";
CodeActionProvider.registerRefactorAction(refactorName, {
  getAvailableActions: (params: ICodeActionParams): IRefactorCodeAction[] => {
    const result: IRefactorCodeAction[] = [];
    const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
      params.sourceFile.tree.rootNode,
      params.range.start,
    );
    const tree = params.sourceFile.tree;

    if (
      (nodeAtPosition.parent?.type === "type_annotation" ||
        nodeAtPosition.parent?.type === "function_declaration_left") &&
      !TreeUtils.findParentOfType("let_in_expr", nodeAtPosition)
    ) {
      const functionName = nodeAtPosition.text;

      if (TreeUtils.isExposedFunction(tree, functionName)) {
        result.push({
          title: "Unexpose Function",
          kind: CodeActionKind.Refactor,
          data: {
            actionName: "unexpose_function",
            refactorName,
            uri: params.sourceFile.uri,
            range: params.range,
          },
        });
      } else {
        result.push({
          title: "Expose Function",
          kind: CodeActionKind.Refactor,
          data: {
            actionName: "expose_function",
            refactorName,
            uri: params.sourceFile.uri,
            range: params.range,
          },
        });
      }
    }

    if (
      nodeAtPosition.type === "upper_case_identifier" &&
      (nodeAtPosition.parent?.type === "type_alias_declaration" ||
        nodeAtPosition.parent?.type === "type_declaration")
    ) {
      const typeName = nodeAtPosition.text;

      const alias =
        nodeAtPosition.parent?.type === "type_alias_declaration"
          ? " Alias"
          : "";

      if (TreeUtils.isExposedTypeOrTypeAlias(tree, typeName)) {
        result.push({
          title: `Unexpose Type${alias}`,
          kind: CodeActionKind.Refactor,
          data: {
            actionName: "unexpose_type",
            refactorName,
            uri: params.sourceFile.uri,
            range: params.range,
          },
        });
      } else {
        result.push({
          title: `Expose Type${alias}`,
          kind: CodeActionKind.Refactor,
          data: {
            actionName: "expose_type",
            refactorName,
            uri: params.sourceFile.uri,
            range: params.range,
          },
        });
      }
    }

    return result;
  },
  getEditsForAction: (
    params: ICodeActionParams,
    actionName: string,
  ): IRefactorEdit => {
    const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
      params.sourceFile.tree.rootNode,
      params.range.start,
    );

    const tree = params.sourceFile.tree;

    switch (actionName) {
      case "unexpose_function":
      case "unexpose_type": {
        const edit = RefactorEditUtils.unexposedValueInModule(
          tree,
          nodeAtPosition.text,
        );
        return edit ? { edits: [edit] } : {};
      }
      case "expose_function":
      case "expose_type": {
        const edit = RefactorEditUtils.exposeValueInModule(
          tree,
          nodeAtPosition.text,
        );
        return edit ? { edits: [edit] } : {};
      }
    }

    return {};
  },
});
