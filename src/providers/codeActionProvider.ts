import {
  ApplyWorkspaceEditResponse,
  CodeAction,
  CodeActionParams,
  ExecuteCommandParams,
  IConnection,
} from "vscode-languageserver";
import {
  ELM_ANALYSE_MATCHER,
  ElmAnalyseDiagnostics,
} from "./diagnostics/elmAnalyseDiagnostics";
import { ElmMakeDiagnostics } from "./diagnostics/elmMakeDiagnostics";
import { URI } from "vscode-uri";
export const COMMAND_RUN_TESTS_CURRENT_FILE = `elmLS.runTestsCurrentFile`;
export const COMMAND_RUN_TESTS = `elmLS.runTests`;

export class CodeActionProvider {
  constructor(
    private connection: IConnection,
    private elmAnalyse: ElmAnalyseDiagnostics | null,
    private elmMake: ElmMakeDiagnostics,
  ) {
    this.connection = connection;
    this.elmAnalyse = elmAnalyse;
    this.elmMake = elmMake;
    this.onCodeAction = this.onCodeAction.bind(this);
    this.onExecuteCommand = this.onExecuteCommand.bind(this);
    this.connection.onCodeAction(this.onCodeAction);
    this.connection.onExecuteCommand(this.onExecuteCommand);
  }

  private onCodeAction(params: CodeActionParams): CodeAction[] {
    this.connection.console.info("A code action was requested");
    const analyse =
      (this.elmAnalyse && this.elmAnalyse.onCodeAction(params)) || [];
    const make = this.elmMake.onCodeAction(params);
    return [...analyse, ...make];
  }

  private async onExecuteCommand(params: ExecuteCommandParams) {
    this.connection.console.info("A command execution was requested");
    if (params.command.startsWith(ELM_ANALYSE_MATCHER) && this.elmAnalyse) {
      return this.elmAnalyse.onExecuteCommand(params);
    } else {
      return this.onExecuteTestCommand(params);
    }
  }

  private async onExecuteTestCommand(
    params: ExecuteCommandParams,
  ): Promise<ApplyWorkspaceEditResponse | undefined> {
    switch (params.command) {
      case COMMAND_RUN_TESTS:
        if (params.arguments) {
          this.connection.window.showErrorMessage(params.arguments.toString());
          this.elmMake.createDiagnostics(URI.parse("test"));
        }
        return;
      case COMMAND_RUN_TESTS_CURRENT_FILE:
        return;
    }
  }
}
