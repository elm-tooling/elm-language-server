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

    // If the branch is prefixed like this Foo.Bar.Biz ->
    // We need to prefix the other branches with the same prefix (Foo.Bar.) for it to compile
    const prefix = branches[0]
      .descendantsOfType("upper_case_identifier")
      .slice(0, -1) // Don't take the last one since that's the variant
      .map((x) => x.text)
      .join(".");

    const edit = PatternMatches.missing(patterns, params.program).reduce(
      (edit, missing) => {
        if (prefix) {
          missing = `${prefix}.${missing}`;
        }

        return `${edit}\n\n${branchIndent}${missing} ->\n${branchExprIndent}Debug.todo "branch '${missing}' not implemented"`;
      },
      "",
    );

    // case_of_expr might be wrapped in parenthesis, those are included in the case_of_expr's endPosition
    // So we try to get the last case_of_branch's endPosition if it exists
    // Otherwise we just fallback to taking the case_of_expr's end position
    const insertPosition =
      nodeAtPosition.children.filter((x) => x.type == "case_of_branch").at(-1)
        ?.endPosition ?? nodeAtPosition.endPosition;

    return [
      TextEdit.insert(
        PositionUtil.FROM_TS_POSITION(insertPosition).toVSPosition(),
        edit,
      ),
    ];
  }

  return [];
}
