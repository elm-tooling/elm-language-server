import { container } from "tsyringe";
import {
  ApplyWorkspaceEditResponse,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  ExecuteCommandParams,
  IConnection,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { SyntaxNode, Tree } from "web-tree-sitter";
import { IElmWorkspace } from "../elmWorkspace";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { RefactorEditUtils } from "../util/refactorEditUtils";
import { IClientSettings, Settings } from "../util/settings";
import { TreeUtils } from "../util/treeUtils";
import { findType } from "../util/types/typeInference";
import { TypeRenderer } from "../util/types/typeRenderer";
import { ElmAnalyseDiagnostics } from "./diagnostics/elmAnalyseDiagnostics";
import { ElmLsDiagnostics } from "./diagnostics/elmLsDiagnostics";
import { ElmMakeDiagnostics } from "./diagnostics/elmMakeDiagnostics";
import { TypeInferenceDiagnostics } from "./diagnostics/typeInferenceDiagnostics";
import { ExposeUnexposeHandler } from "./handlers/exposeUnexposeHandler";
import { MoveRefactoringHandler } from "./handlers/moveRefactoringHandler";

export class CodeActionProvider {
  private connection: IConnection;
  private settings: Settings;
  private elmAnalyse: ElmAnalyseDiagnostics | null = null;
  private elmMake: ElmMakeDiagnostics;
  private functionTypeAnnotationDiagnostics: TypeInferenceDiagnostics;
  private elmDiagnostics: ElmLsDiagnostics;
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
    this.functionTypeAnnotationDiagnostics = container.resolve<
      TypeInferenceDiagnostics
    >(TypeInferenceDiagnostics);
    this.elmDiagnostics = container.resolve<ElmLsDiagnostics>(ElmLsDiagnostics);
    this.connection = container.resolve<IConnection>("Connection");

    this.onCodeAction = this.onCodeAction.bind(this);
    this.onExecuteCommand = this.onExecuteCommand.bind(this);
    this.connection.onCodeAction(
      new ElmWorkspaceMatcher((param: CodeActionParams) =>
        URI.parse(param.textDocument.uri),
      ).handlerForWorkspace(this.onCodeAction.bind(this)),
    );
    this.connection.onExecuteCommand(this.onExecuteCommand.bind(this));

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
    const typeAnnotation = this.functionTypeAnnotationDiagnostics.onCodeAction(
      params,
    );
    const elmDiagnostics = this.elmDiagnostics.onCodeAction(params);
    return [
      ...this.getRefactorCodeActions(params, elmWorkspace),
      ...this.getTypeAnnotationCodeActions(params, elmWorkspace),
      ...analyse,
      ...make,
      ...typeAnnotation,
      ...elmDiagnostics,
    ];
  }

  private async onExecuteCommand(
    params: ExecuteCommandParams,
  ): Promise<ApplyWorkspaceEditResponse | null | undefined> {
    this.connection.console.info("A command execution was requested");
    return this.elmAnalyse && this.elmAnalyse.onExecuteCommand(params);
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
          checker.findType(nodeAtPosition.parent, params.textDocument.uri),
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
          checker.findType(nodeAtPosition, params.textDocument.uri),
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
}
