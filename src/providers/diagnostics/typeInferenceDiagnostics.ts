/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { IElmWorkspace } from "../../elmWorkspace";
import { findType } from "../../util/types/typeInference";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { PositionUtil } from "../../positionUtil";
import { TreeUtils } from "../../util/treeUtils";
import { Utils } from "../../util/utils";
import { URI } from "vscode-uri";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { TypeRenderer } from "../../util/types/typeRenderer";

export class TypeInferenceDiagnostics {
  TYPE_INFERENCE = "Type Inference";

  private elmWorkspaceMatcher: ElmWorkspaceMatcher<URI>;

  constructor() {
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((uri) => uri);
  }

  public createDiagnostics = (
    tree: Tree,
    uri: string,
    elmWorkspace: IElmWorkspace,
  ): Diagnostic[] => {
    let diagnostics: Diagnostic[] = [];

    const allTopLevelFunctions = TreeUtils.findAllTopLevelFunctionDeclarationsWithoutTypeAnnotation(
      tree,
    );

    if (allTopLevelFunctions) {
      const inferencedTypes = allTopLevelFunctions
        .filter(Utils.notUndefinedOrNull)
        .map((func) => func.firstChild)
        .filter(Utils.notUndefinedOrNull)
        .map((node) => {
          const typeString: string = TypeRenderer.typeToString(
            findType(node, uri, elmWorkspace),
            node.tree,
            uri,
            elmWorkspace.getImports(),
          );

          if (typeString && typeString !== "Unknown" && node.firstNamedChild) {
            return {
              range: this.getNodeRange(node.firstNamedChild),
              message: `Missing type annotation: \`${typeString}\``,
              severity: DiagnosticSeverity.Information,
              source: this.TYPE_INFERENCE,
            };
          }
        })
        .filter(Utils.notUndefined.bind(this));

      diagnostics = inferencedTypes ?? [];
    }

    return diagnostics;
  };

  public onCodeAction(params: CodeActionParams): CodeAction[] {
    const { uri } = params.textDocument;
    const typeInferenceDiagnostics: Diagnostic[] = this.filterTypeInferenceDiagnostics(
      params.context.diagnostics,
    );

    return this.convertDiagnosticsToCodeActions(typeInferenceDiagnostics, uri);
  }

  private filterTypeInferenceDiagnostics(
    diagnostics: Diagnostic[],
  ): Diagnostic[] {
    return diagnostics.filter(
      (diagnostic) => diagnostic.source === this.TYPE_INFERENCE,
    );
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
        const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
          treeContainer.tree.rootNode,
          diagnostic.range.start,
        );

        if (nodeAtPosition.parent) {
          const typeString: string = TypeRenderer.typeToString(
            findType(nodeAtPosition.parent, uri, elmWorkspace),
            nodeAtPosition.tree,
            uri,
            elmWorkspace.getImports(),
          );

          result.push(
            this.insertQuickFixAtStart(
              uri,
              `${nodeAtPosition.text} : ${typeString}\n`,
              diagnostic,
              "Add inferred annotation",
            ),
          );
        }
      });
    }
    return result;
  }

  private insertQuickFixAtStart(
    uri: string,
    replaceWith: string,
    diagnostic: Diagnostic,
    title: string,
  ): CodeAction {
    const map: {
      [uri: string]: TextEdit[];
    } = {};
    if (!map[uri]) {
      map[uri] = [];
    }
    map[uri].push(TextEdit.insert(diagnostic.range.start, replaceWith));
    return {
      diagnostics: [diagnostic],
      edit: { changes: map },
      kind: CodeActionKind.QuickFix,
      title,
    };
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
