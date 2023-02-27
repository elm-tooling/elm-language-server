import { container } from "tsyringe";
import { CodeActionKind } from "vscode-languageserver";
import { Settings } from "../../util/settings";
import { TreeUtils } from "../../util/treeUtils";
import {
  CodeActionProvider,
  IRefactorCodeAction,
  IRefactorEdit,
} from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";

const refactorName = "move_function";
CodeActionProvider.registerRefactorAction(refactorName, {
  getAvailableActions: (params: ICodeActionParams): IRefactorCodeAction[] => {
    if (
      !container.resolve<Settings>("Settings").extendedCapabilities
        ?.moveFunctionRefactoringSupport
    ) {
      return [];
    }

    const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
      params.sourceFile.tree.rootNode,
      params.range.start,
    );

    if (
      (nodeAtPosition.parent?.type === "type_annotation" ||
        nodeAtPosition.parent?.type === "function_declaration_left") &&
      !TreeUtils.findParentOfType("let_in_expr", nodeAtPosition)
    ) {
      const functionName = nodeAtPosition.text;

      return [
        {
          title: "Move Function",
          command: {
            title: "Refactor",
            command: `elm.refactor-${params.program.getRootPath().toString()}`,
            arguments: [
              "moveFunction",
              { textDocument: params.textDocument, range: params.range },
              functionName,
            ],
          },
          kind: CodeActionKind.RefactorRewrite,
          data: {
            actionName: "move_function",
            refactorName,
            uri: params.sourceFile.uri,
            range: params.range,
          },
        },
      ];
    }

    return [];
  },
  getEditsForAction: (): IRefactorEdit => {
    return {};
  },
});
