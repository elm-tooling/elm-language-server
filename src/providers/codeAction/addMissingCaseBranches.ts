import { CodeAction, Range, TextEdit } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";
import { CodeActionProvider } from "..";
import { ISourceFile } from "../../compiler/forest";
import { getSpaces } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../compiler/diagnostics";
import { TypeChecker } from "../../compiler/typeChecker";
import { Type } from "../../compiler/typeInference";
import { ICodeActionParams } from "../paramsExtensions";
import { Utils } from "../../util/utils";
import { PatternMatches } from "../../compiler/patternMatches";
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
  getFixAllCodeAction: (params: ICodeActionParams): CodeAction | undefined => {
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
    const patterns = nodeAtPosition.namedChildren
      .filter((n) => n.type === "case_of_branch")
      .map((branch) => branch.childForFieldName("pattern"))
      .filter(Utils.notUndefinedOrNull.bind(getEdits));

    const indent = getSpaces(nodeAtPosition.startPosition.column);

    const edit = PatternMatches.missing(patterns, params.program).reduce(
      (edit, missing) => edit + `\n\n${indent}\t${missing} ->\n\t\t${indent}\t`,
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

function createFields(
  fields: [string, Type][],
  targetRecord: SyntaxNode,
  checker: TypeChecker,
  sourceFile: ISourceFile,
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
