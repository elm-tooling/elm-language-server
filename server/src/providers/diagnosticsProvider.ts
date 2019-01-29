import URI from "vscode-uri";

import {
  IConnection,
  PublishDiagnosticsParams,
} from "vscode-languageserver";
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

    connection.onDidSaveTextDocument(async (didTextSaveParams) => {
      const elmMakeDiagnostics = new ElmMakeDiagnostics(connection, elmWorkspaceFolder);
      diagnostics = await elmMakeDiagnostics.createDiagnostics(didTextSaveParams);

      diagnostics.forEach((diagnostic) =>
        connection.sendDiagnostics(diagnostic));
    });
  }
}
