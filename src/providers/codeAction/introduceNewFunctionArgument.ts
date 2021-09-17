import { CodeAction, Position, Range, TextEdit } from "vscode-languageserver";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../compiler/diagnostics";
import { CodeActionProvider, ICodeAction } from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";
import { SyntaxNode } from "web-tree-sitter";

const errorCodes = [Diagnostics.MissingValue.code];
const fixId = "introduce_new_function_argument";

// TODO: qualified names should not suggest adding to arg list
// TODO: currently always adding parenthesis even if redundant
// TODO: fix adding to function that already have the correct signature
// TODO: introduce fresh variable name when adding to signature
CodeActionProvider.registerCodeAction({
  errorCodes,
  fixId,
  getCodeActions: (params: ICodeActionParams) =>
    getActions(params, params.range),
  getFixAllCodeAction: (params: ICodeActionParams): ICodeAction | undefined =>
    undefined,
});

function getActions(params: ICodeActionParams, range: Range): ICodeAction[] {
  const nodeAtPosition = TreeUtils.getNamedDescendantForRange(
    params.sourceFile,
    range,
  );

  return TreeUtils.getAllAncestorsOfType("value_declaration", nodeAtPosition)
    .map((valueDeclaration) =>
      getActionsForValueDeclaration(valueDeclaration, nodeAtPosition, params),
    )
    .filter((e): e is ICodeAction => e != undefined);
}

function getActionsForValueDeclaration(
  valueDeclaration: SyntaxNode,
  nodeAtPosition: SyntaxNode,
  params: ICodeActionParams,
): CodeAction | undefined {
  const lastPattern = valueDeclaration?.firstChild?.lastChild;

  if (!lastPattern) return;

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

  const functionName = valueDeclaration.firstChild?.firstChild?.text;
  return CodeActionProvider.getCodeAction(
    params,
    `Introduce new argument to "${functionName}"`,
    edits,
  );
}
