import { TextEdit } from "vscode-languageserver";
import { CodeActionProvider } from "../codeActionProvider";
import { hasElmReviewFixes } from "../diagnostics/elmReviewDiagnostics";

CodeActionProvider.registerCodeAction({
  errorCodes: ["elm_review"],
  fixId: "elm_review_fix",
  getCodeActions: (params) => {
    return params.context.diagnostics
      .filter(hasElmReviewFixes)
      .map(({ data: { fixes } }) =>
        CodeActionProvider.getCodeAction(
          params,
          "Apply elm-review fix",
          fixes.map(({ range, string }) => TextEdit.replace(range, string)),
        ),
      );
  },
  getFixAllCodeAction: () => undefined,
});
