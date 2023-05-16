import { Range, TextEdit } from "vscode-languageserver";
import { CodeActionProvider, ICodeAction } from "..";
import { getSpaces } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../../compiler/diagnostics";
import { ICodeActionParams } from "../paramsExtensions";
import { Utils } from "../../util/utils";
import { PatternMatches } from "../../../compiler/patternMatches";
import { PositionUtil } from "../../positionUtil";

const errorCodes = [Diagnostics.IncompleteCasePattern(0).code];
const fixId = "add_missing_case_branches";

CodeActionProvider.registerCodeAction({
  errorCodes,
  fixId,
  getCodeActions: (params: ICodeActionParams) => {
    const edits = getEdits(params, params.range);

    return [
      CodeActionProvider.getCodeAction(
        params,
        "Add missing case branches",
        edits,
      ),
    ];
  },
  getFixAllCodeAction: (params: ICodeActionParams): ICodeAction | undefined => {
    return CodeActionProvider.getFixAllCodeAction(
      "Add all missing case branches",
      params,
      errorCodes,
      fixId,
      (edits, diagnostic) => {
        edits.push(...getEdits(params, diagnostic.range));
      },
    );
  },
});

function getEdits(params: ICodeActionParams, range: Range): TextEdit[] {
  const nodeAtPosition = TreeUtils.getNamedDescendantForRange(
    params.sourceFile,
    range,
  );

  if (nodeAtPosition.type === "case_of_expr") {
    const branches = nodeAtPosition.namedChildren.filter(
      (n) => n.type === "case_of_branch",
    );
    const patterns = branches
      .map((branch) => branch.childForFieldName("pattern"))
      .filter(Utils.notUndefinedOrNull);

    const branchIndent = getSpaces(branches[0].startPosition.column);
    const branchExprIndent = getSpaces(
      branches[0].childForFieldName("expr")?.startPosition.column ??
        branches[0].startPosition.column + 4,
    );

    const edit = PatternMatches.missing(patterns, params.program).reduce(
      (edit, missing) =>
        edit +
        `\n\n${branchIndent}${missing} ->\n${branchExprIndent}Debug.todo "branch '${missing}' not implemented"`,
      "",
    );

    return [
      TextEdit.insert(
        PositionUtil.FROM_TS_POSITION(
          nodeAtPosition.endPosition,
        ).toVSPosition(),
        edit,
      ),
    ];
  }

  return [];
}
