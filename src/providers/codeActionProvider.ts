import {
  CodeAction,
  CodeActionParams,
  ExecuteCommandParams,
  IConnection,
} from "vscode-languageserver";
import { ElmAnalyseDiagnostics } from "./diagnostics/elmAnalyseDiagnostics";
import { ElmMakeDiagnostics } from "./diagnostics/elmMakeDiagnostics";

export class CodeActionProvider {
  private connection: IConnection;
  private elmAnalyse: ElmAnalyseDiagnostics;
  private elmMake: ElmMakeDiagnostics;

  constructor(
    connection: IConnection,
    elmAnalyse: ElmAnalyseDiagnostics,
    elmMake: ElmMakeDiagnostics,
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
    return this.elmAnalyse
      .onCodeAction(params)
      .concat(this.elmMake.onCodeAction(params));
  }

  private async onExecuteCommand(params: ExecuteCommandParams) {
    this.connection.console.info("A command execution was requested");
    return this.elmAnalyse.onExecuteCommand(params);
  }
}
