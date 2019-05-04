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
    this.connection.onCodeAction(this.onCodeAction);
    this.connection.onExecuteCommand(this.onExecuteCommand);
  }

  private onCodeAction(params: CodeActionParams): CodeAction[] {
    return this.elmAnalyse.onCodeAction(params);
  }

  private async onExecuteCommand(params: ExecuteCommandParams) {
    return this.elmAnalyse.onExecuteCommand(params);
  }
}
