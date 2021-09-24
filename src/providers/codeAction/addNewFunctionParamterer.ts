import { CodeAction, Position, Range, TextEdit } from "vscode-languageserver";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../compiler/diagnostics";
import { CodeActionProvider, ICodeAction } from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";
import { SyntaxNode } from "web-tree-sitter";

const errorCodes = [Diagnostics.MissingValue.code];
const fixId = "add_new_function_parameter";

CodeActionProvider.registerCodeAction({
  errorCodes,
  fixId,
  getCodeActions: (params: ICodeActionParams) =>
    getActions(params, params.range),
  getFixAllCodeAction: (_: ICodeActionParams): ICodeAction | undefined =>
    undefined,
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
  const lastPattern = valueDeclaration?.firstChild?.lastChild;

  if (!lastPattern) return;

  const valueParameterPosition = Position.create(
    lastPattern.endPosition.row,
    lastPattern.endPosition.column + 1,
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
  return CodeActionProvider.getCodeAction(
    params,
    `Add new parameter to "${functionName}"`,
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

  let typeString = checker.typeToString(type, params.sourceFile);
  if (type.nodeType == "Var") {
    typeString = nodeAtPosition.text;
  }
  if (typeString.includes(" ")) {
    typeString = `(${typeString})`;
  }

  const typeParameterPosition = Position.create(
    lastParameterType.startPosition.row,
    lastParameterType.startPosition.column,
  );

  return [TextEdit.insert(typeParameterPosition, `${typeString} -> `)];
}
