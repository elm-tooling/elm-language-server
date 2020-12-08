import {
  CodeAction,
  CodeActionKind,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { PositionUtil } from "../../positionUtil";
import { getSpaces } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../util/types/diagnostics";
import { CodeActionProvider, IRefactorCodeAction } from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";

const errorCodes = [Diagnostics.MissingTypeAnnotation.code];
const fixId = "add_type_annotation";

CodeActionProvider.registerCodeAction({
  errorCodes,
  fixId,
  getCodeActions: (params: ICodeActionParams): CodeAction[] => {
    const edits = getEdits(params, params.range);

    if (edits.length > 0) {
      return [
        CodeActionProvider.getCodeAction(
          params,
          "Add inferred annotation",
          edits,
        ),
      ];
    }

    return [];
  },
  getFixAllCodeAction: (params: ICodeActionParams): CodeAction | undefined => {
    return CodeActionProvider.getFixAllCodeAction(
      "Add all missing type annotations",
      params,
      errorCodes,
      fixId,
      (edits, diagnostic) => {
        edits.push(...getEdits(params, diagnostic.range));
      },
    );
  },
});

// Handle adding annotation to let expr declaration
const refactorName = "add_type_annotation";
CodeActionProvider.registerRefactorAction(refactorName, {
  getAvailableActions: (params: ICodeActionParams): IRefactorCodeAction[] => {
    const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
      params.sourceFile.tree.rootNode,
      params.range.start,
    );

    if (
      nodeAtPosition.parent?.type === "function_declaration_left" &&
      TreeUtils.findParentOfType("let_in_expr", nodeAtPosition) &&
      nodeAtPosition.parent.parent &&
      !TreeUtils.getTypeAnnotation(nodeAtPosition.parent.parent)
    ) {
      return [
        {
          title: "Add inferred annotation",
          kind: CodeActionKind.RefactorExtract,
          data: {
            actionName: "add_type_annotation",
            refactorName,
            uri: params.sourceFile.uri,
            range: params.range,
          },
        },
      ];
    }

    return [];
  },
  getEditsForAction: (params: ICodeActionParams): TextEdit[] => {
    return getEdits(params, params.range);
  },
});

function getEdits(params: ICodeActionParams, range: Range): TextEdit[] {
  const nodeAtPosition = TreeUtils.getNamedDescendantForRange(
    params.sourceFile,
    range,
  );

  const checker = params.program.getTypeChecker();

  if (nodeAtPosition.parent) {
    const typeString: string = checker.typeToString(
      checker.findType(nodeAtPosition.parent),
      params.sourceFile,
    );

    const startPosition = PositionUtil.FROM_TS_POSITION(
      nodeAtPosition.startPosition,
    ).toVSPosition();
    return [
      TextEdit.insert(
        startPosition,
        `${nodeAtPosition.text} : ${typeString}\n${getSpaces(
          startPosition.character,
        )}`,
      ),
    ];
  } else {
    return [];
  }
}
