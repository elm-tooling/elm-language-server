import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  ExecuteCommandParams,
  IConnection,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode } from "web-tree-sitter";
import { ElmWorkspace } from "../elmWorkspace";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { Settings } from "../util/settings";
import { TreeUtils } from "../util/treeUtils";
import { ElmAnalyseDiagnostics } from "./diagnostics/elmAnalyseDiagnostics";
import { ElmMakeDiagnostics } from "./diagnostics/elmMakeDiagnostics";
import { MoveRefactoringHandler } from "./handlers/moveRefactoringHandler";

export class CodeActionProvider {
  constructor(
    private connection: IConnection,
    private elmWorkspaces: ElmWorkspace[],
    private settings: Settings,
    private elmAnalyse: ElmAnalyseDiagnostics | null,
    private elmMake: ElmMakeDiagnostics,
  ) {
    this.onCodeAction = this.onCodeAction.bind(this);
    this.onExecuteCommand = this.onExecuteCommand.bind(this);
    this.connection.onCodeAction(
      new ElmWorkspaceMatcher(elmWorkspaces, (param: CodeActionParams) =>
        URI.parse(param.textDocument.uri),
      ).handlerForWorkspace(this.onCodeAction),
    );
    this.connection.onExecuteCommand(this.onExecuteCommand);

    if (settings.extendedCapabilities?.moveFunctionRefactoringSupport) {
      // tslint:disable-next-line: no-unused-expression
      new MoveRefactoringHandler(this.connection, this.elmWorkspaces);
    }
  }

  private onCodeAction(
    params: CodeActionParams,
    elmWorkspace: ElmWorkspace,
  ): CodeAction[] {
    this.connection.console.info("A code action was requested");
    const analyse =
      (this.elmAnalyse && this.elmAnalyse.onCodeAction(params)) ?? [];
    const make = this.elmMake.onCodeAction(params);
    return [
      ...analyse,
      ...make,
      ...this.getRefactorCodeActions(params, elmWorkspace),
    ];
  }

  private async onExecuteCommand(params: ExecuteCommandParams) {
    this.connection.console.info("A command execution was requested");
    return this.elmAnalyse && this.elmAnalyse.onExecuteCommand(params);
  }

  private getRefactorCodeActions(
    params: CodeActionParams,
    elmWorkspace: ElmWorkspace,
  ): CodeAction[] {
    const codeActions: CodeAction[] = [];

    const forest = elmWorkspace.getForest();
    const tree = forest.getTree(params.textDocument.uri);

    if (tree) {
      const nodeAtPosition = TreeUtils.getNamedDescendantForPosition(
        tree.rootNode,
        params.range.start,
      );

      if (this.settings.extendedCapabilities?.moveFunctionRefactoringSupport) {
        codeActions.push(
          ...this.getMoveFunctionCodeActions(params, nodeAtPosition),
        );
      }
    }

    return codeActions;
  }

  private getMoveFunctionCodeActions(
    params: CodeActionParams,
    nodeAtPosition: SyntaxNode,
  ): CodeAction[] {
    const codeActions: CodeAction[] = [];

    if (
      nodeAtPosition.parent?.type === "type_annotation" ||
      nodeAtPosition.parent?.type === "function_declaration_left"
    ) {
      codeActions.push({
        title: "Move Function",
        command: {
          title: "Refactor",
          command: "elm.refactor",
          arguments: [
            "moveFunction",
            params,
            nodeAtPosition.parent?.type === "type_annotation"
              ? nodeAtPosition.text
              : nodeAtPosition.parent.text,
          ],
        },
        kind: CodeActionKind.RefactorRewrite,
      });
    }

    return codeActions;
  }
}
