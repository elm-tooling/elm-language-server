import {
  CodeAction,
  CodeActionParams,
  ExecuteCommandParams,
  IConnection,
} from "vscode-languageserver";
import { ElmAnalyseDiagnostics } from "./diagnostics/elmAnalyseDiagnostics";

export class CodeActionProvider {
  private connection: IConnection;
  private elmAnalyse: ElmAnalyseDiagnostics;

  constructor(connection: IConnection, elmAnalyse: ElmAnalyseDiagnostics) {
    this.connection = connection;
    this.elmAnalyse = elmAnalyse;
    this.onCodeAction = this.onCodeAction.bind(this);
    this.onExecuteCommand = this.onExecuteCommand.bind(this);
    this.connection.onCodeAction(this.onCodeAction);
    this.connection.onExecuteCommand(this.onExecuteCommand);
  }

  private onCodeAction(params: CodeActionParams): CodeAction[] {
    this.connection.console.info("A code action was requested");
    return this.elmAnalyse.onCodeAction(params);
  }

  private async onExecuteCommand(params: ExecuteCommandParams) {
    this.connection.console.info("A command execution was requested");
    return this.elmAnalyse.onExecuteCommand(params);
  }
}
