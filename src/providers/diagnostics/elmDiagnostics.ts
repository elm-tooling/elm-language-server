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
    try {
      return [
        ...this.getUnusedImportDiagnostics(tree),
        ...this.getUnusedImportValueAndTypeDiagnostics(tree),
        ...this.getUnusedImportAliasDiagnostics(tree),
        ...this.getUnusedPatternVariableDiagnostics(tree),
        ...this.getCaseBranchMapNothingToNothingDiagnostics(tree),
        ...this.getBooleanCaseExpressionDiagnostics(tree),
      ];
    } catch (e) {
      console.log(e);
    }
    return [];
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

        if (diagnostic.code === "unused_pattern") {
          const node = TreeUtils.getNamedDescendantForPosition(
            treeContainer.tree.rootNode,
            diagnostic.range.start,
          );

          const edit =
            node.parent?.parent?.type === "record_pattern"
              ? RefactorEditUtils.removeRecordPatternValue(node.parent)
              : TextEdit.replace(diagnostic.range, "_");

          result.push({
            diagnostics: [diagnostic],
            edit: {
              changes: { [uri]: [edit] },
            },
            kind: CodeActionKind.QuickFix,
            title: `Fix unused pattern \`${node.text}\``,
          });
        }
      });
    }
    return result;
  }

  private getUnusedImportDiagnostics(tree: Tree): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const moduleImports = this.language
      .query(
        `
        (import_clause 
          (upper_case_qid) @moduleName
        )
        `,
      )
      .matches(tree.rootNode)
      .map((match) => match.captures[0].node)
      .filter(
        (node) =>
          node.nextNamedSibling?.type !== "exposing_list" &&
          node.nextNamedSibling?.type !== "as_clause",
      );

    // Would need to adjust tree-sitter (use fields) to get a better query
    moduleImports.forEach((moduleImport) => {
      const references = this.language
        .query(
          `
          (value_qid
            (
              (upper_case_identifier)
              (dot)
            )* @module.reference
          )
          (upper_case_qid
            (
              (upper_case_identifier)
              (dot)
            )* @module.reference
          )
          `,
        )
        .matches(tree.rootNode)
        .filter(Utils.notUndefined.bind(this))
        .filter(
          (match) =>
            match.captures.length > 0 &&
            match.captures[0].node.parent?.type !== "import_clause",
        )
        .map((match) => match.captures.map((n) => n.node.text).join("."))
        .filter((moduleReference) => moduleReference === moduleImport.text);

      if (references.length === 0 && moduleImport.parent) {
        diagnostics.push({
          code: "unused_import",
          range: this.getNodeRange(moduleImport.parent),
          message: `Unused import \`${moduleImport.text}\``,
          severity: DiagnosticSeverity.Warning,
          source: this.ELM,
          tags: [DiagnosticTag.Unnecessary],
        });
      }
    });

    return diagnostics;
  }

  private getUnusedImportValueAndTypeDiagnostics(tree: Tree): Diagnostic[] {
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

  private getUnusedImportAliasDiagnostics(tree: Tree): Diagnostic[] {
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
          (value_qid
            (
              (upper_case_identifier)
              (dot)
            )* @module.reference
          )
          (upper_case_qid
            (
              (upper_case_identifier)
              (dot)
            )* @module.reference
          )
          `,
        )
        .matches(tree.rootNode)
        .filter(Utils.notUndefined.bind(this))
        .filter((match) => match.captures.length > 0)
        .map((match) => match.captures[0].node.text)
        .filter((moduleReference) => moduleReference === moduleAlias.text);

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

  private getUnusedPatternVariableDiagnostics(tree: Tree): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const patternMatches = this.language
      .query(
        `
        (value_declaration
          (function_declaration_left
            [
              (pattern)
              (record_pattern)
              (lower_pattern)
            ] @pattern
          )
        ) @patternScope

        ; For some reason, we can match on the let_in_expr
        (value_declaration
          [
            (pattern)
            (record_pattern)
          ] @pattern
        ) @patternScope

        ; For let expr variables
        (value_declaration
          (function_declaration_left
            (lower_case_identifier) @pattern
          )
        ) @patternScope

        (case_of_branch
          (pattern) @pattern
        ) @patternScope

        (anonymous_function_expr
          (pattern) @pattern
        ) @patternScope
        `,
      )
      .matches(tree.rootNode);

    patternMatches
      .filter(Utils.notUndefined.bind(this))
      .map((match) => {
        let scope = match.captures[0].node;
        const patternMatch = match.captures[1].node;

        // Adjust the scope of let_in_expr due to the query bug above
        if (
          scope.type === "value_declaration" &&
          scope.parent?.type === "let_in_expr" &&
          (patternMatch.type === "lower_case_identifier" ||
            patternMatch.parent?.type === "value_declaration")
        ) {
          scope = scope.parent;
        }

        if (
          patternMatch.type === "lower_case_identifier" &&
          scope.parent?.type === "file"
        ) {
          scope = scope.parent;
        }

        return patternMatch.type === "lower_pattern" ||
          patternMatch.type === "lower_case_identifier"
          ? [{ scope, pattern: patternMatch }]
          : patternMatch.descendantsOfType("lower_pattern").map((pattern) => {
              return { scope, pattern };
            });
      })
      .reduce((a, b) => a.concat(b), [])
      .forEach(({ scope, pattern }) => {
        const references = this.language
          .query(
            `
            (
              [
                (value_expr)
                (record_base_identifier)
                (exposed_value)
              ] @patternVariable.reference
              (#eq? @patternVariable.reference "${pattern.text}")
            )
            `,
          )
          .matches(scope)
          .filter(Utils.notUndefined.bind(this));

        if (references.length === 0) {
          if (scope.type === "file") {
            diagnostics.push({
              code: "unused_top_level",
              range: this.getNodeRange(pattern),
              message: `Unused top level definition \`${pattern.text}\``,
              severity: DiagnosticSeverity.Warning,
              source: this.ELM,
              tags: [DiagnosticTag.Unnecessary],
            });
          } else {
            diagnostics.push({
              code: "unused_pattern",
              range: this.getNodeRange(pattern),
              message: `Unused pattern variable \`${pattern.text}\``,
              severity: DiagnosticSeverity.Warning,
              source: this.ELM,
              tags: [DiagnosticTag.Unnecessary],
            });
          }
        }
      });

    return diagnostics;
  }

  private getCaseBranchMapNothingToNothingDiagnostics(
    tree: Tree,
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const caseBranches = this.language
      .query(
        `
        (
          (case_of_branch 
            (pattern) @casePattern
            (value_expr) @caseValue
          ) @caseBranch
          (#eq? @casePattern "Nothing")
          (#eq? @caseValue "Nothing")
        )
      `,
      )
      .matches(tree.rootNode)
      .map((match) => match.captures[0].node);

    caseBranches.forEach((caseBranch) => {
      diagnostics.push({
        code: "map_nothing_to_nothing",
        range: this.getNodeRange(caseBranch),
        message: `\`Nothing\` mapped to \`Nothing\` in case expression. Use Maybe.map or Maybe.andThen instead.`,
        severity: DiagnosticSeverity.Warning,
        source: this.ELM,
      });
    });

    return diagnostics;
  }

  private getBooleanCaseExpressionDiagnostics(tree: Tree): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // For some reason, we can't match on case_expr, tree-sitter throws a memory access error
    const caseExpressions = this.language
      .query(
        `
        (
          (case_of_branch
            pattern: (pattern) @casePattern1
            (#match? @casePattern1 "^(True|False)$")
          ) @caseBranch
          (case_of_branch
            pattern: (pattern) @casePattern2
            (#match? @casePattern2 "^(True|False|_)$")
          )
        )
        `,
      )
      .matches(tree.rootNode)
      .map((match) => match.captures[0].node.parent)
      .filter(Utils.notUndefinedOrNull.bind(this));

    caseExpressions.forEach((caseExpr) => {
      diagnostics.push({
        code: "boolean_case_expr",
        range: this.getNodeRange(caseExpr),
        message: `Use an if expression instead of a case expression.`,
        severity: DiagnosticSeverity.Warning,
        source: this.ELM,
      });
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
