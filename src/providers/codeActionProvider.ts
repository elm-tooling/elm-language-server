import { container } from "tsyringe";
import {
  ApplyWorkspaceEditResponse,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  ExecuteCommandParams,
  IConnection,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode, SyntaxType, Tree } from "tree-sitter-elm";
import { IElmWorkspace } from "../elmWorkspace";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { RefactorEditUtils } from "../util/refactorEditUtils";
import { IClientSettings, Settings } from "../util/settings";
import { TreeUtils } from "../util/treeUtils";
import { ElmAnalyseDiagnostics } from "./diagnostics/elmAnalyseDiagnostics";
import { ElmMakeDiagnostics } from "./diagnostics/elmMakeDiagnostics";
import { ExposeUnexposeHandler } from "./handlers/exposeUnexposeHandler";
import { MoveRefactoringHandler } from "./handlers/moveRefactoringHandler";

export class CodeActionProvider {
  private connection: IConnection;
  private settings: Settings;
  private elmAnalyse: ElmAnalyseDiagnostics | null = null;
  private elmMake: ElmMakeDiagnostics;
  private clientSettings: IClientSettings;

  constructor() {
    this.settings = container.resolve("Settings");
    this.clientSettings = container.resolve("ClientSettings");
    if (this.clientSettings.elmAnalyseTrigger !== "never") {
      this.elmAnalyse = container.resolve<ElmAnalyseDiagnostics | null>(
        ElmAnalyseDiagnostics,
      );
    }
    this.elmMake = container.resolve<ElmMakeDiagnostics>(ElmMakeDiagnostics);
    this.connection = container.resolve<IConnection>("Connection");

    this.onCodeAction = this.onCodeAction.bind(this);
    this.onExecuteCommand = this.onExecuteCommand.bind(this);
    this.connection.onCodeAction(
      new ElmWorkspaceMatcher((param: CodeActionParams) =>
        URI.parse(param.textDocument.uri),
      ).handlerForWorkspace(this.onCodeAction),
    );
    this.connection.onExecuteCommand(this.onExecuteCommand);

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
    const analyse =
      (this.elmAnalyse && this.elmAnalyse.onCodeAction(params)) ?? [];
    const make = this.elmMake.onCodeAction(params);
    return [
      ...analyse,
      ...make,
      ...this.getRefactorCodeActions(params, elmWorkspace),
    ];
  }

  private async onExecuteCommand(
    params: ExecuteCommandParams,
  ): Promise<ApplyWorkspaceEditResponse | null | undefined> {
    this.connection.console.info("A command execution was requested");
    return this.elmAnalyse && this.elmAnalyse.onExecuteCommand(params);
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
      nodeAtPosition.parent?.type === "type_annotation" ||
      nodeAtPosition.parent?.type === "function_declaration_left"
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
      nodeAtPosition.type === SyntaxType.UpperCaseIdentifier &&
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
}
