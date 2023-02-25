import { Range, TextEdit } from "vscode-languageserver";
import { CodeActionProvider, ICodeAction } from "..";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { TreeUtils } from "../../util/treeUtils";
import { Diagnostics } from "../../compiler/diagnostics";
import { Type } from "../../compiler/typeInference";
import { ICodeActionParams } from "../paramsExtensions";
import { Utils } from "../../util/utils";

const errorCodes = [Diagnostics.MissingValue.code];
const fixId = "add_missing_union_type";

CodeActionProvider.registerCodeAction({
  errorCodes,
  fixId,
  getCodeActions: (params: ICodeActionParams) => {
    const edits = getEdits(params, params.range);

    if (Object.values(edits).some((edit) => edit.length > 0)) {
      return [
        CodeActionProvider.getCodeAction(
          params,
          `Create missing union constructor`,
          edits,
        ),
      ];
    }

    return [];
  },
  getFixAllCodeAction: (params: ICodeActionParams): ICodeAction | undefined => {
    return CodeActionProvider.getFixAllCodeAction(
      "Create all missing union constructors",
      params,
      errorCodes,
      fixId,
      () => {
        // Not used
      },
      (changes, diagnostic) => {
        Utils.mergeChanges(changes, getEdits(params, diagnostic.range));
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
    nodeAtPosition.type === "upper_case_identifier" &&
    nodeParent?.type === "upper_case_qid"
  ) {
    const checker = params.program.getTypeChecker();

    let type = checker.findType(nodeAtPosition);

    let paramTypes: Type[] = [];

    if (type.nodeType === "Function" && type.return.nodeType === "Union") {
      paramTypes = type.params;
      type = type.return;
    }

    if (type.nodeType === "Union") {
      const typeDeclaration = checker.findSymbolOfUnionType(
        type,
        params.sourceFile,
      )?.node;

      if (typeDeclaration) {
        const typeDeclarationSourceFile = params.program.getSourceFile(
          typeDeclaration.tree.uri,
        );

        const edit = RefactorEditUtils.addUnionVariant(
          typeDeclaration,
          nodeAtPosition.text,
          paramTypes.map((type) =>
            checker.typeToString(type, typeDeclarationSourceFile),
          ),
        );

        if (edit) {
          return {
            [typeDeclaration.tree.uri]: [edit],
          };
        }
      }
    }
  }

  return {};
}
