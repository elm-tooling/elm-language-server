import { CodeAction, Range, TextEdit } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { CodeActionProvider } from "..";
import { ITreeContainer } from "../../forest";
import { getSpaces } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../util/types/diagnostics";
import { TypeChecker } from "../../util/types/typeChecker";
import { Type } from "../../util/types/typeInference";
import { ICodeActionParams } from "../paramsExtensions";

const errorCodes = [Diagnostics.RecordField.code];
const fixId = "add_missing_record_field";

CodeActionProvider.registerCodeAction({
  errorCodes,
  fixId,
  getCodeActions: (params: ICodeActionParams) => {
    const edits = getEdits(params, params.range);

    if (Object.values(edits).some((edit) => edit.length > 0)) {
      const single = Object.values(edits).every((edit) => edit.length === 1);

      return [
        CodeActionProvider.getCodeAction(
          params,
          `Create missing record ${single ? "field" : "fields"}`,
          edits,
        ),
      ];
    }

    return [];
  },
  getFixAllCodeAction: (params: ICodeActionParams): CodeAction | undefined => {
    return CodeActionProvider.getFixAllCodeAction(
      "Create all missing record fields",
      params,
      errorCodes,
      fixId,
      () => {
        // Not used
      },
      (changes, diagnostic) => {
        mergeChanges(changes, getEdits(params, diagnostic.range));
      },
    );
  },
});

function getEdits(
  params: ICodeActionParams,
  range: Range,
): { [uri: string]: TextEdit[] } {
  const nodeAtPosition = TreeUtils.getNamedDescendantForRange(
    params.sourceFile,
    range,
  );

  const nodeParent = nodeAtPosition.parent;
  if (
    nodeAtPosition.type === "lower_case_identifier" &&
    (nodeParent?.type === "field_access_expr" || nodeParent?.type === "field")
  ) {
    const checker = params.program.getTypeChecker();
    const fieldName = nodeAtPosition.text;

    let target =
      nodeParent.type === "field_access_expr"
        ? nodeParent?.childForFieldName("target")
        : nodeParent.type === "field"
        ? nodeParent.parent
        : nodeAtPosition;

    // Adjust for parenthesis expr. Will need to change when we handle it better in inference
    if (target?.type === "parenthesized_expr") {
      target = target.namedChildren[1];
    }

    if (target) {
      const expectedType = checker.findType(
        nodeParent.type === "field_access_expr" ? nodeParent : nodeAtPosition,
      );

      return createFields(
        [[fieldName, expectedType]],
        target,
        checker,
        params.sourceFile,
      );
    }
  }

  return {};
}

function createFields(
  fields: [string, Type][],
  targetRecord: SyntaxNode,
  checker: TypeChecker,
  sourceFile: ITreeContainer,
): { [uri: string]: TextEdit[] } {
  const type = checker.findType(targetRecord);

  if (type.nodeType === "Record") {
    const fieldNames = Object.keys(type.fields);
    const lastFieldRef = TreeUtils.findFieldReference(
      type,
      fieldNames[fieldNames.length - 1],
    );

    if (lastFieldRef) {
      const useNewLine =
        lastFieldRef.node.parent?.startPosition.row !==
        lastFieldRef.node.parent?.endPosition.row;
      const indendation = getSpaces(lastFieldRef.node.startPosition.column - 2);

      const edits = fields.map(([fieldName, fieldType]) => {
        const typeString: string = checker.typeToString(fieldType, sourceFile);

        return TextEdit.insert(
          {
            line: lastFieldRef?.node.endPosition.row,
            character: lastFieldRef?.node.endPosition.column,
          },
          `${
            useNewLine ? "\n" + indendation : ""
          }, ${fieldName} : ${typeString}`,
        );
      });

      return { [lastFieldRef.uri]: edits };
    }
  }

  return {};
}

function mergeChanges(
  a: { [uri: string]: TextEdit[] },
  b: { [uri: string]: TextEdit[] },
): void {
  Object.entries(b).forEach(([uri, edits]) => {
    if (a[uri]) {
      a[uri].push(...edits);
    } else {
      a[uri] = edits;
    }
  });
}
