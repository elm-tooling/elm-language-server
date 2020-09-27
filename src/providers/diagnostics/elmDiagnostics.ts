/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { Language, Parser, SyntaxNode, Tree } from "web-tree-sitter";
import { PositionUtil } from "../../positionUtil";
import { container } from "tsyringe";
import { Utils } from "../../util/utils";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { URI } from "vscode-uri";
import { TreeUtils } from "../../util/treeUtils";

export class ElmDiagnostics {
  ELM = "Elm";

  private language: Language;
  private elmWorkspaceMatcher: ElmWorkspaceMatcher<URI>;

  constructor() {
    this.language = container.resolve<Parser>("Parser").getLanguage();
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((uri) => uri);
  }

  public createDiagnostics = (tree: Tree, uri: string): Diagnostic[] => {
    return [
      ...this.getUnusedValueAndTypeDiagnostics(tree),
      ...this.getUnusedAliasDiagnostics(tree),
    ];
  };

  public onCodeAction(params: CodeActionParams): CodeAction[] {
    const { uri } = params.textDocument;
    const elmDiagnostics: Diagnostic[] = params.context.diagnostics.filter(
      (diagnostic) => diagnostic.source === this.ELM,
    );

    return this.convertDiagnosticsToCodeActions(elmDiagnostics, uri);
  }

  private convertDiagnosticsToCodeActions(
    diagnostics: Diagnostic[],
    uri: string,
  ): CodeAction[] {
    const result: CodeAction[] = [];

    const elmWorkspace = this.elmWorkspaceMatcher.getElmWorkspaceFor(
      URI.parse(uri),
    );

    const forest = elmWorkspace.getForest();

    const treeContainer = forest.getByUri(uri);

    if (treeContainer) {
      diagnostics.forEach((diagnostic) => {
        if (diagnostic.code === "unused_value") {
          const node = TreeUtils.getNamedDescendantForPosition(
            treeContainer.tree.rootNode,
            diagnostic.range.start,
          );

          const importClause = TreeUtils.findParentOfType(
            "import_clause",
            node,
          );

          if (!importClause) {
            return;
          }

          const moduleName = TreeUtils.findFirstNamedChildOfType(
            "upper_case_qid",
            importClause,
          );

          if (!moduleName) {
            return;
          }

          const removeValueEdit = RefactorEditUtils.removeValueFromImport(
            treeContainer.tree,
            moduleName.text,
            node.text,
          );

          if (removeValueEdit) {
            result.push({
              diagnostics: [diagnostic],
              edit: {
                changes: {
                  [uri]: [removeValueEdit],
                },
              },
              kind: CodeActionKind.QuickFix,
              title: `Remove unused ${
                node.type === "exposed_type" ? "type" : "value"
              } \`${node.text}\``,
            });
          }
        }

        if (diagnostic.code === "unused_alias") {
          const node = TreeUtils.getNamedDescendantForPosition(
            treeContainer.tree.rootNode,
            diagnostic.range.end,
          );

          result.push({
            diagnostics: [diagnostic],
            edit: {
              changes: { [uri]: [TextEdit.del(diagnostic.range)] },
            },
            kind: CodeActionKind.QuickFix,
            title: `Remove unused alias \`${node.text}\``,
          });
        }
      });
    }
    return result;
  }

  private getUnusedValueAndTypeDiagnostics(tree: Tree): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const exposedValuesAndTypes = this.language
      .query(
        `
      (import_clause 
        (exposing_list
          (exposed_value) @exposedValue
        )
      )
      (import_clause 
        (exposing_list
          (exposed_type) @exposedType
        )
      )
      `,
      )
      .matches(tree.rootNode)
      .map((match) => match.captures[0].node);

    exposedValuesAndTypes.forEach((exposedValueOrType) => {
      if (exposedValueOrType.text.endsWith("(..)")) {
        return;
      }

      const references = this.language
        .query(
          `
      ((value_expr) @value.reference
        (#eq? @value.reference "${exposedValueOrType.text}")
      )
      ((type_ref 
        (upper_case_qid) @type.reference)
        (#eq? @type.reference "${exposedValueOrType.text}")
      )
      `,
        )
        .matches(tree.rootNode)
        .filter(Utils.notUndefined.bind(this));

      if (references.length === 0) {
        diagnostics.push({
          code: "unused_value",
          range: this.getNodeRange(exposedValueOrType),
          message: `Unused imported ${
            exposedValueOrType.type === "exposed_type" ? "type" : "value"
          } \`${exposedValueOrType.text}\``,
          severity: DiagnosticSeverity.Warning,
          source: this.ELM,
          tags: [DiagnosticTag.Unnecessary],
        });
      }
    });

    return diagnostics;
  }

  private getUnusedAliasDiagnostics(tree: Tree): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const moduleAliases = this.language
      .query(
        `
      (import_clause 
        (as_clause
          (upper_case_identifier) @moduleAlias
        )
      )
      `,
      )
      .matches(tree.rootNode)
      .map((match) => match.captures[0].node);

    moduleAliases.forEach((moduleAlias) => {
      const references = this.language
        .query(
          `
      ((value_expr
        [
        (value_qid 
          (upper_case_identifier) @moduleAlias.reference)
        (upper_case_qid 
          (upper_case_identifier) @moduleAlias.reference)
        ]
        )
        (#eq? @moduleAlias.reference "${moduleAlias.text}")
      )
      `,
        )
        .matches(tree.rootNode)
        .filter(Utils.notUndefined.bind(this));

      if (references.length === 0 && moduleAlias.parent) {
        diagnostics.push({
          code: "unused_alias",
          range: this.getNodeRange(moduleAlias.parent),
          message: `Unused import alias \`${moduleAlias.text}\``,
          severity: DiagnosticSeverity.Warning,
          source: this.ELM,
          tags: [DiagnosticTag.Unnecessary],
        });
      }
    });

    return diagnostics;
  }

  private getNodeRange(node: SyntaxNode): Range {
    const end = PositionUtil.FROM_TS_POSITION(node.endPosition).toVSPosition();
    return {
      start: PositionUtil.FROM_TS_POSITION(node.startPosition).toVSPosition(),
      end: {
        ...end,
        character: end.character,
      },
    };
  }
}
