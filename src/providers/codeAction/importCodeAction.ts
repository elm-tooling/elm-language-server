import { CodeAction, TextEdit } from "vscode-languageserver";
import { Range } from "vscode-languageserver-textdocument";
import { SyntaxNode } from "web-tree-sitter";
import { ITreeContainer } from "../../forest";
import { ImportUtils, IPossibleImport } from "../../util/importUtils";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../util/types/diagnostics";
import { findDefinition } from "../../util/types/expressionTree";
import { CodeActionProvider } from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";

const errorCodes = [Diagnostics.MissingValue.code];
const fixId = "import";

CodeActionProvider.registerCodeAction({
  errorCodes,
  fixId,
  getCodeActions: (params: ICodeActionParams): CodeAction[] | undefined => {
    const valueNode = TreeUtils.getNamedDescendantForRange(
      params.sourceFile,
      params.range,
    );

    return getPossibleImports(params, params.range).map((possibleImport) => {
      const edit = getEditFromPossibleImport(
        params.sourceFile,
        params.range,
        possibleImport,
      );

      const valueToImport = getValueToImport(valueNode, possibleImport);

      return CodeActionProvider.getCodeAction(
        params,
        valueToImport
          ? `Import '${valueToImport}' from module "${possibleImport.module}"`
          : `Import module "${possibleImport.module}"`,
        edit ? [edit] : [],
      );
    });
  },
  getFixAllCodeAction: (params: ICodeActionParams) => {
    return CodeActionProvider.getFixAllCodeAction(
      "Add all missing imports",
      params,
      errorCodes,
      fixId,
      (edits, diagnostic) => {
        const firstPossibleImport = getPossibleImports(
          params,
          diagnostic.range,
        )[0];

        if (firstPossibleImport) {
          const edit = getEditFromPossibleImport(
            params.sourceFile,
            diagnostic.range,
            firstPossibleImport,
          );

          if (edit && !edits.find((e) => e.newText === edit.newText)) {
            edits.push(edit);
          }
        }
      },
    );
  },
});

function getPossibleImports(
  params: ICodeActionParams,
  range: Range,
): IPossibleImport[] {
  const valueNode = TreeUtils.getNamedDescendantForRange(
    params.sourceFile,
    range,
  );

  const possibleImports = ImportUtils.getPossibleImports(
    params.sourceFile,
    params.program.getForest(),
  );

  // Add import quick fixes
  if (valueNode) {
    return possibleImports.filter(
      (exposed) =>
        exposed.value === valueNode.text ||
        ((valueNode.type === "upper_case_qid" ||
          valueNode.type === "value_qid") &&
          exposed.value ===
            valueNode.namedChildren[valueNode.namedChildren.length - 1].text &&
          exposed.module ===
            valueNode.namedChildren
              .slice(0, valueNode.namedChildren.length - 2) // Dots are also namedNodes
              .map((a) => a.text)
              .join("")),
    );
  }

  return [];
}

function getEditFromPossibleImport(
  sourceFile: ITreeContainer,
  range: Range,
  possibleImport: IPossibleImport,
): TextEdit | undefined {
  const valueNode = TreeUtils.getNamedDescendantForRange(sourceFile, range);

  return RefactorEditUtils.addImport(
    sourceFile.tree,
    possibleImport.module,
    getValueToImport(valueNode, possibleImport),
  );
}

function getValueToImport(
  valueNode: SyntaxNode,
  possibleImport: IPossibleImport,
): string | undefined {
  return valueNode.type !== "upper_case_qid" && valueNode.type !== "value_qid"
    ? possibleImport.valueToImport ?? possibleImport.value
    : undefined;
}
