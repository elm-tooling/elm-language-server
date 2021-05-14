import { TextEdit } from "vscode-languageserver";
import { Utils } from "../../util/utils";
import { CodeActionProvider } from "../codeActionProvider";
import { IElmReviewDiagnostic } from "../diagnostics/elmReviewDiagnostics";

const errorCodes = ["elm_review"];
const fixId = "elm_review_fix";
CodeActionProvider.registerCodeAction({
  errorCodes,
  fixId,
  getCodeActions: (params) => {
    return (<IElmReviewDiagnostic[]>params.context.diagnostics)
      .map((diagnostic) => {
        const { title, edits } = getEditsForDiagnostic(diagnostic);

        if (title) {
          return CodeActionProvider.getCodeAction(params, title, edits);
        }
      })
      .filter(Utils.notUndefined);
  },
  getFixAllCodeAction: () => {
    return undefined;
  },
});

function getEditsForDiagnostic(
  diagnostic: IElmReviewDiagnostic,
): { title?: string; edits: TextEdit[] } {
  if (
    diagnostic.data.code !== "elm_review" ||
    diagnostic.data.fixes === undefined
  ) {
    return { edits: [] };
  }

  return {
    title: "Apply elm-review fix",
    edits: diagnostic.data.fixes.map((fix) =>
      TextEdit.replace(fix.range, fix.string),
    ),
  };
}
