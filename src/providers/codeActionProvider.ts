import { container } from "tsyringe";
import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Connection,
  Diagnostic,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { IElmWorkspace } from "../elmWorkspace";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { RefactorEditUtils } from "../util/refactorEditUtils";
import { Settings } from "../util/settings";
import { TreeUtils } from "../util/treeUtils";
import { ElmLsDiagnostics } from "./diagnostics/elmLsDiagnostics";
import { ElmMakeDiagnostics } from "./diagnostics/elmMakeDiagnostics";
import { ExposeUnexposeHandler } from "./handlers/exposeUnexposeHandler";
import { MoveRefactoringHandler } from "./handlers/moveRefactoringHandler";

export class CodeActionProvider {
  private connection: Connection;
  private settings: Settings;
  private elmMake: ElmMakeDiagnostics;
  private elmDiagnostics: ElmLsDiagnostics;

  constructor() {
    this.settings = container.resolve("Settings");
    this.elmMake = container.resolve(ElmMakeDiagnostics);
    this.elmDiagnostics = container.resolve(ElmLsDiagnostics);
    this.connection = container.resolve<Connection>("Connection");

    this.onCodeAction = this.onCodeAction.bind(this);
    this.connection.onCodeAction(
      new ElmWorkspaceMatcher((param: CodeActionParams) =>
        URI.parse(param.textDocument.uri),
      ).handlerForWorkspace(this.onCodeAction.bind(this)),
    );

    if (this.settings.extendedCapabilities?.moveFunctionRefactoringSupport) {
      new MoveRefactoringHandler();
    }

    new ExposeUnexposeHandler();
  }

  private onCodeAction(
    params: CodeActionParams,
    elmWorkspace: IElmWorkspace,
  ): CodeAction[] {
    this.connection.console.info("A code action was requested");
    const make = this.elmMake.onCodeAction(params);
    const elmDiagnostics = this.elmDiagnostics.onCodeAction(params);
    return [
      ...this.convertDiagnosticsToCodeActions(
        params.context.diagnostics,
        elmWorkspace,
        params.textDocument.uri,
      ),
      ...this.getRefactorCodeActions(params, elmWorkspace),
      ...this.getTypeAnnotationCodeActions(params, elmWorkspace),
      ...make,
      ...elmDiagnostics,
    ];
  }

  private getTypeAnnotationCodeActions(
    params: CodeActionParams,
    elmWorkspace: IElmWorkspace,
  ): CodeAction[] {
    // Top level annotation are handled by diagnostics
    const codeActions: CodeAction[] = [];

    const forest = elmWorkspace.getForest();
    const treeContainer = forest.getByUri(params.textDocument.uri);
    const tree = treeContainer?.tree;
    const checker = elmWorkspace.getTypeChecker();

    if (tree) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        tree.rootNode,
        params.range.start,
      );

      if (
        nodeAtPosition.parent?.type === "function_declaration_left" &&
        TreeUtils.findParentOfType("let_in_expr", nodeAtPosition) &&
        nodeAtPosition.parent.parent &&
        !TreeUtils.getTypeAnnotation(nodeAtPosition.parent.parent)
      ) {
        const typeString: string = checker.typeToString(
          checker.findType(nodeAtPosition.parent),
          treeContainer,
        );

        codeActions.push({
          edit: {
            changes: {
              [params.textDocument.uri]: [
                TextEdit.insert(
                  {
                    line: nodeAtPosition.startPosition.row,
                    character: nodeAtPosition.startPosition.column,
                  },
                  `${nodeAtPosition.text} : ${typeString}\n${Array(
                    nodeAtPosition.startPosition.column + 1,
                  ).join(" ")}`,
                ),
              ],
            },
          },
          kind: CodeActionKind.QuickFix,
          title: "Add inferred annotation",
        });
      }
    }

    return codeActions;
  }

  private getRefactorCodeActions(
    params: CodeActionParams,
    elmWorkspace: IElmWorkspace,
  ): CodeAction[] {
    const codeActions: CodeAction[] = [];

    const forest = elmWorkspace.getForest();
    const tree = forest.getTree(params.textDocument.uri);

    if (tree) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        tree.rootNode,
        params.range.start,
      );

      codeActions.push(
        ...this.getFunctionCodeActions(params, tree, nodeAtPosition),
        ...this.getTypeAliasCodeActions(params, tree, nodeAtPosition),
        ...this.getMakeDeclarationFromUsageCodeActions(
          params,
          elmWorkspace,
          nodeAtPosition,
        ),
      );
    }

    return codeActions;
  }

  private getFunctionCodeActions(
    params: CodeActionParams,
    tree: Tree,
    nodeAtPosition: SyntaxNode,
  ): CodeAction[] {
    const codeActions: CodeAction[] = [];

    if (
      (nodeAtPosition.parent?.type === "type_annotation" ||
        nodeAtPosition.parent?.type === "function_declaration_left") &&
      !TreeUtils.findParentOfType("let_in_expr", nodeAtPosition)
    ) {
      const functionName = nodeAtPosition.text;

      if (this.settings.extendedCapabilities?.moveFunctionRefactoringSupport) {
        codeActions.push({
          title: "Move Function",
          command: {
            title: "Refactor",
            command: "elm.refactor",
            arguments: ["moveFunction", params, functionName],
          },
          kind: CodeActionKind.RefactorRewrite,
        });
      }

      if (TreeUtils.isExposedFunction(tree, functionName)) {
        const edit = RefactorEditUtils.unexposedValueInModule(
          tree,
          functionName,
        );

        if (edit) {
          codeActions.push({
            title: "Unexpose Function",
            edit: {
              changes: {
                [params.textDocument.uri]: [edit],
              },
            },
            kind: CodeActionKind.Refactor,
          });
        }
      } else {
        const edit = RefactorEditUtils.exposeValueInModule(tree, functionName);

        if (edit) {
          codeActions.push({
            title: "Expose Function",
            edit: {
              changes: {
                [params.textDocument.uri]: [edit],
              },
            },
            kind: CodeActionKind.Refactor,
          });
        }
      }
    }

    return codeActions;
  }

  private getTypeAliasCodeActions(
    params: CodeActionParams,
    tree: Tree,
    nodeAtPosition: SyntaxNode,
  ): CodeAction[] {
    const codeActions: CodeAction[] = [];

    if (
      nodeAtPosition.type === "upper_case_identifier" &&
      (nodeAtPosition.parent?.type === "type_alias_declaration" ||
        nodeAtPosition.parent?.type === "type_declaration")
    ) {
      const typeName = nodeAtPosition.text;

      const alias =
        nodeAtPosition.parent?.type === "type_alias_declaration"
          ? " Alias"
          : "";

      if (TreeUtils.isExposedTypeOrTypeAlias(tree, typeName)) {
        const edit = RefactorEditUtils.unexposedValueInModule(tree, typeName);

        if (edit) {
          codeActions.push({
            title: `Unexpose Type${alias}`,
            edit: {
              changes: {
                [params.textDocument.uri]: [edit],
              },
            },
            kind: CodeActionKind.Refactor,
          });
        }
      } else {
        const edit = RefactorEditUtils.exposeValueInModule(tree, typeName);

        if (edit) {
          codeActions.push({
            title: `Expose Type${alias}`,
            edit: {
              changes: {
                [params.textDocument.uri]: [edit],
              },
            },
            kind: CodeActionKind.Refactor,
          });
        }
      }
    }

    return codeActions;
  }

  private getMakeDeclarationFromUsageCodeActions(
    params: CodeActionParams,
    elmWorkspace: IElmWorkspace,
    nodeAtPosition: SyntaxNode,
  ): CodeAction[] {
    const codeActions: CodeAction[] = [];

    if (
      nodeAtPosition.type === "lower_case_identifier" &&
      nodeAtPosition.parent?.parent?.type === "value_expr" &&
      nodeAtPosition.parent?.parent?.parent &&
      nodeAtPosition.previousSibling?.type !== "dot"
    ) {
      const funcName = nodeAtPosition.text;

      const treeContainer = elmWorkspace
        .getForest()
        .getByUri(params.textDocument.uri);
      const tree = treeContainer?.tree;
      const checker = elmWorkspace.getTypeChecker();

      if (
        tree &&
        !TreeUtils.findAllTopLevelFunctionDeclarations(tree)?.some(
          (a) =>
            a.firstChild?.text == funcName ||
            a.firstChild?.firstChild?.text == funcName,
        )
      ) {
        const insertLineNumber = RefactorEditUtils.findLineNumberAfterCurrentFunction(
          nodeAtPosition,
        );

        const typeString: string = checker.typeToString(
          checker.findType(nodeAtPosition),
          treeContainer,
        );

        const edit = RefactorEditUtils.createTopLevelFunction(
          insertLineNumber ?? tree.rootNode.endPosition.row,
          funcName,
          typeString,
          TreeUtils.findParentOfType("function_call_expr", nodeAtPosition),
        );

        if (edit) {
          codeActions.push({
            title: `Create local function`,
            edit: {
              changes: {
                [params.textDocument.uri]: [edit],
              },
            },
            kind: CodeActionKind.QuickFix,
          });
        }
      }
    }

    return codeActions;
  }

  private convertDiagnosticsToCodeActions(
    diagnostics: Diagnostic[],
    elmWorkspace: IElmWorkspace,
    uri: string,
  ): CodeAction[] {
    const result: CodeAction[] = [];

    const forest = elmWorkspace.getForest();
    const treeContainer = forest.getByUri(uri);
    const checker = elmWorkspace.getTypeChecker();

    if (treeContainer) {
      diagnostics.forEach((diagnostic) => {
        switch (diagnostic.code) {
          case "missing_type_annotation":
            {
              const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
                treeContainer.tree.rootNode,
                diagnostic.range.start,
              );

              if (nodeAtPosition.parent) {
                const typeString: string = checker.typeToString(
                  checker.findType(nodeAtPosition.parent),
                  treeContainer,
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
            }
            break;
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
}
