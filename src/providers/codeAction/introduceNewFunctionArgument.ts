import { Position, Range, TextEdit } from "vscode-languageserver";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../compiler/diagnostics";
import { CodeActionProvider, ICodeAction } from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";

const errorCodes = [Diagnostics.MissingValue.code];
const fixId = "introduce_new_function_argument";

// TODO: qualified names should not suggest adding to arg list
// TODO: currently always adding parenthesis even if redundant
// TODO: handle nested functions
CodeActionProvider.registerCodeAction({
  errorCodes,
  fixId,
  getCodeActions: (params: ICodeActionParams) => {
    const edits = getEdits(params, params.range);

    if (edits.length > 0) {
      return [
        CodeActionProvider.getCodeAction(
          params,
          "Introduce new argument to function",
          edits,
        ),
      ];
    }

    return [];
  },
  getFixAllCodeAction: (params: ICodeActionParams): ICodeAction | undefined =>
    undefined,
});

function getEdits(params: ICodeActionParams, range: Range): TextEdit[] {
  const nodeAtPosition = TreeUtils.getNamedDescendantForRange(
    params.sourceFile,
    range,
  );

  const valueDeclaration = TreeUtils.findParentOfType(
    "value_declaration",
    nodeAtPosition,
  );
  const lastPattern = valueDeclaration?.firstChild?.lastChild;

  if (!lastPattern) return [];

  const valueArgumentPosition = Position.create(
    lastPattern.endPosition.row,
    lastPattern.endPosition.column + 1,
  );

  let edits = [
    TextEdit.insert(valueArgumentPosition, nodeAtPosition.text + " "),
  ];

  const typeAnnotation = TreeUtils.getTypeAnnotation(valueDeclaration);
  const lastArgumentType =
    typeAnnotation?.childForFieldName("typeExpression")?.lastChild;

  if (lastArgumentType) {
    const checker = params.program.getTypeChecker();
    const type = checker.findType(nodeAtPosition);
    const typeString = checker.typeToString(type, params.sourceFile);

    const typeArgumentPosition = Position.create(
      lastArgumentType.startPosition.row,
      lastArgumentType.startPosition.column,
    );

    edits.push(TextEdit.insert(typeArgumentPosition, `(${typeString}) -> `));
  }

  return edits;
}
