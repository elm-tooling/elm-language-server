import URI from "vscode-uri";

import {
  IConnection,
  PublishDiagnosticsParams,
} from "vscode-languageserver";
import { ElmAnalyseDiagnostics } from "./elmAnalyseDiagnostics";
import { ElmMakeDiagnostics } from "./elmMakeDiagnostics";

export interface IElmIssueRegion {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface IElmIssue {
  tag: string;
  overview: string;
  subregion: string;
  details: string;
  region: IElmIssueRegion;
  type: string;
  file: string;
}

export class DiagnosticsProvider {
  constructor(connection: IConnection, elmWorkspaceFolder: URI) {
    let diagnostics: PublishDiagnosticsParams[] = [];
    const elmMakeDiagnostics = new ElmMakeDiagnostics(connection, elmWorkspaceFolder);
    const elmAnalyseDiagnostics = new ElmAnalyseDiagnostics(connection, elmWorkspaceFolder);

    connection.onDidSaveTextDocument(async (didTextSaveParams) => {
      diagnostics = await elmMakeDiagnostics.createDiagnostics(didTextSaveParams);

      const analyseDiagnostics = await elmAnalyseDiagnostics.execActivateAnalyseProcesses(didTextSaveParams);
      diagnostics.push(...analyseDiagnostics);

      diagnostics.forEach((diagnostic) =>
        connection.sendDiagnostics(diagnostic));
    });
  }
}
