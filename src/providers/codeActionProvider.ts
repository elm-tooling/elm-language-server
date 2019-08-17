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
  private elmAnalyse: ElmAnalyseDiagnostics | null;
  private elmMake: ElmMakeDiagnostics;

  constructor(
    connection: IConnection,
    elmAnalyse: ElmAnalyseDiagnostics | null,
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
    const analyse =
      (this.elmAnalyse && this.elmAnalyse.onCodeAction(params)) || [];
    const make = this.elmMake.onCodeAction(params);
    return [...analyse, ...make];
  }

  private async onExecuteCommand(params: ExecuteCommandParams) {
    this.connection.console.info("A command execution was requested");
    return this.elmAnalyse && this.elmAnalyse.onExecuteCommand(params);
  }
}
