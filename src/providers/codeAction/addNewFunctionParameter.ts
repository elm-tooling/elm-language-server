import { CodeAction, Position, Range, TextEdit } from "vscode-languageserver";
import { TreeUtils } from "../../util/treeUtils.js";
import { Diagnostics } from "../../compiler/diagnostics.js";
import { CodeActionProvider, ICodeAction } from "../codeActionProvider.js";
import { ICodeActionParams } from "../paramsExtensions.js";
import { SyntaxNode } from "web-tree-sitter";

const errorCodes = [Diagnostics.MissingValue.code];
const fixId = "add_new_function_parameter";

CodeActionProvider.registerCodeAction({
  errorCodes,
  fixId,
  getCodeActions: (params: ICodeActionParams) =>
    getActions(params, params.range),
  getFixAllCodeAction: (): ICodeAction | undefined => undefined,
});

function getActions(
  params: ICodeActionParams,
  range: Range,
): ICodeAction[] | undefined {
  const nodeAtPosition = TreeUtils.getNamedDescendantForRange(
    params.sourceFile,
    range,
  );

  if (
    nodeAtPosition.type === "lower_case_identifier" &&
    nodeAtPosition.parent?.parent?.type === "value_expr" &&
    nodeAtPosition.parent?.parent?.parent &&
    nodeAtPosition.previousSibling?.type !== "dot"
  ) {
    return TreeUtils.getAllAncestorsOfType("value_declaration", nodeAtPosition)
      .map((valueDeclaration) =>
        getActionsForValueDeclaration(valueDeclaration, nodeAtPosition, params),
      )
      .filter((e): e is ICodeAction => e != undefined);
  }
}

function getActionsForValueDeclaration(
  valueDeclaration: SyntaxNode,
  nodeAtPosition: SyntaxNode,
  params: ICodeActionParams,
): CodeAction | undefined {
  const lastFunctionParameter = valueDeclaration?.firstChild?.lastChild;

  if (!lastFunctionParameter) return;

  const valueParameterPosition = Position.create(
    lastFunctionParameter.endPosition.row,
    lastFunctionParameter.endPosition.column + 1,
  );

  const edits = getEditsForSignatureUpdate(
    params,
    nodeAtPosition,
    valueDeclaration,
  );

  edits.push(
    TextEdit.insert(valueParameterPosition, nodeAtPosition.text + " "),
  );

  const functionName = valueDeclaration.firstChild?.firstChild?.text;

  if (!functionName) return;

  return CodeActionProvider.getCodeAction(
    params,
    `Add new parameter to '${functionName}'`,
    edits,
  );
}

function getEditsForSignatureUpdate(
  params: ICodeActionParams,
  nodeAtPosition: SyntaxNode,
  valueDeclaration: SyntaxNode,
): TextEdit[] {
  const typeAnnotation = TreeUtils.getTypeAnnotation(valueDeclaration);
  const lastParameterType =
    typeAnnotation?.childForFieldName("typeExpression")?.lastChild;

  if (!lastParameterType) return [];

  const checker = params.program.getTypeChecker();
  const type = checker.findType(nodeAtPosition);

  let typeString =
    type.nodeType == "Var"
      ? nodeAtPosition.text
      : checker.typeToString(type, params.sourceFile);

  if (typeString.includes(" ")) {
    typeString = `(${typeString})`;
  }

  const typeParameterPosition = Position.create(
    lastParameterType.startPosition.row,
    lastParameterType.startPosition.column,
  );

  return [TextEdit.insert(typeParameterPosition, `${typeString} -> `)];
}
