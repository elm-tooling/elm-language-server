import { CodeAction, Range, TextEdit } from "vscode-languageserver";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../util/types/diagnostics";
import { CodeActionProvider, ICodeActionParams } from "../codeActionProvider";

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

    return [
      TextEdit.insert(range.start, `${nodeAtPosition.text} : ${typeString}\n`),
    ];
  } else {
    return [];
  }
}
