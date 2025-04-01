import { CodeAction, TextEdit } from "vscode-languageserver";
import { Range } from "vscode-languageserver-textdocument";
import { Node } from "web-tree-sitter";
import { ISourceFile } from "../../../compiler/forest";
import { ImportUtils, IPossibleImport } from "../../util/importUtils";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../../compiler/diagnostics";
import { CodeActionProvider } from "../codeActionProvider";
import { ICodeActionParams } from "../paramsExtensions";

const errorCodes = [Diagnostics.MissingValue.code];
const fixId = "import";

CodeActionProvider.registerCodeAction({
  errorCodes,
  fixId,
  preferredAction: {
    priority: 1,
    thereCanOnlyBeOne: true,
  },
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

      const importAlias = edit?.importAlias ? ` as "${edit.importAlias}"` : "";

      return CodeActionProvider.getCodeAction(
        params,
        valueToImport
          ? `Import '${valueToImport}' from module "${possibleImport.module}"${importAlias}`
          : `Import module "${possibleImport.module}"${importAlias}`,
        edit ? [edit.edit] : [],
      );
    });
  },
  getFixAllCodeAction: (params: ICodeActionParams) => {
    const possibleImportsCache = new Map<string, IPossibleImport[]>();

    return CodeActionProvider.getFixAllCodeAction(
      "Add all missing imports",
      params,
      errorCodes,
      fixId,
      (edits, diagnostic) => {
        const firstPossibleImport = getPossibleImports(
          params,
          diagnostic.range,
          possibleImportsCache,
        )[0];

        if (firstPossibleImport) {
          const edit = getEditFromPossibleImport(
            params.sourceFile,
            diagnostic.range,
            firstPossibleImport,
          )?.edit;

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
  possibleImportsCache?: Map<string, IPossibleImport[]>,
): IPossibleImport[] {
  const valueNode = TreeUtils.getNamedDescendantForRange(
    params.sourceFile,
    range,
  );

  const cached = possibleImportsCache?.get(params.sourceFile.uri);

  const possibleImports =
    cached ?? ImportUtils.getPossibleImports(params.program, params.sourceFile);

  possibleImportsCache?.set(params.sourceFile.uri, possibleImports);

  // Add import quick fixes
  if (valueNode) {
    return possibleImports.filter((exposed) => {
      if (exposed.value === valueNode.text) {
        return true;
      }

      if (
        valueNode.type === "upper_case_qid" ||
        valueNode.type === "value_qid"
      ) {
        const targetValue =
          valueNode.namedChildren[valueNode.namedChildren.length - 1].text;

        const targetModule = getTargetModule(valueNode);

        return (
          exposed.value === targetValue &&
          (targetModule.includes(".")
            ? exposed.module === targetModule
            : exposed.module.endsWith(targetModule))
        );
      }

      return false;
    });
  }

  return [];
}

function getEditFromPossibleImport(
  sourceFile: ISourceFile,
  range: Range,
  possibleImport: IPossibleImport,
): { edit: TextEdit; importAlias: string | undefined } | undefined {
  const valueNode = TreeUtils.getNamedDescendantForRange(sourceFile, range);

  const targetModule = getTargetModule(valueNode);
  const edit = RefactorEditUtils.addImport(
    sourceFile.tree,
    possibleImport.module,
    getValueToImport(valueNode, possibleImport),
    targetModule,
  );

  if (edit) {
    return {
      edit,
      importAlias:
        possibleImport.module !== targetModule ? targetModule : undefined,
    };
  }
}

function getValueToImport(
  valueNode: Node,
  possibleImport: IPossibleImport,
): string | undefined {
  return valueNode.type !== "upper_case_qid" && valueNode.type !== "value_qid"
    ? possibleImport.valueToImport ?? possibleImport.value
    : undefined;
}

function getTargetModule(valueNode: Node): string {
  return valueNode.namedChildren
    .slice(0, valueNode.namedChildren.length - 2) // Dots are also namedNodes
    .map((a) => a.text)
    .join("");
}
