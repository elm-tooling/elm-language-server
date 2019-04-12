import {
  Diagnostic,
  DiagnosticSeverity,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  IConnection,
  PublishDiagnosticsParams,
  Range,
} from "vscode-languageserver";
import URI from "vscode-uri";
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
  private elmMakeDiagnostics: ElmMakeDiagnostics;
  private elmAnalyseDiagnostics: ElmAnalyseDiagnostics;
  private connection: IConnection;
  private elmWorkspaceFolder: URI;

  constructor(connection: IConnection, elmWorkspaceFolder: URI) {
    this.connection = connection;
    this.elmWorkspaceFolder = elmWorkspaceFolder;
    this.elmMakeDiagnostics = new ElmMakeDiagnostics(
      connection,
      elmWorkspaceFolder,
    );
    this.elmAnalyseDiagnostics = new ElmAnalyseDiagnostics(
      connection,
      elmWorkspaceFolder,
    );

    connection.onDidOpenTextDocument(
      async (didTextOpenParams: DidOpenTextDocumentParams) => {
        const uri: URI = URI.parse(didTextOpenParams.textDocument.uri);
        this.getDiagnostics(uri);
      },
    );

    connection.onDidSaveTextDocument(
      async (didTextSaveParams: DidSaveTextDocumentParams) => {
        const uri: URI = URI.parse(didTextSaveParams.textDocument.uri);
        this.getDiagnostics(uri);
      },
    );
  }

  private async getDiagnostics(fileUri: URI) {
    const compilerErrors: IElmIssue[] = [];
    compilerErrors.push(
      ...(await this.elmMakeDiagnostics.createDiagnostics(fileUri)),
    );

    compilerErrors.push(
      ...(await this.elmAnalyseDiagnostics.execActivateAnalyseProcesses(
        fileUri,
      )),
    );

    const splitCompilerErrors: Map<string, IElmIssue[]> = new Map();

    compilerErrors.forEach((issue: IElmIssue) => {
      // If provided path is relative, make it absolute
      if (issue.file.startsWith(".")) {
        issue.file = this.elmWorkspaceFolder + issue.file.slice(1);
      }
      if (splitCompilerErrors.has(issue.file)) {
        const issuesForFile = splitCompilerErrors.get(issue.file);
        if (issuesForFile) {
          issuesForFile.push(issue);
        }
      } else {
        splitCompilerErrors.set(issue.file, [issue]);
      }
    });
    const result: PublishDiagnosticsParams[] = [];
    splitCompilerErrors.forEach((issue: IElmIssue[], issuePath: string) => {
      result.push({
        diagnostics: issue.map(error => this.elmMakeIssueToDiagnostic(error)),
        uri: URI.file(issuePath).toString(),
      });
    });

    result.forEach(diagnostic => this.connection.sendDiagnostics(diagnostic));
  }

  private elmMakeIssueToDiagnostic(issue: IElmIssue): Diagnostic {
    const lineRange: Range = Range.create(
      issue.region.start.line === 0
        ? issue.region.start.line
        : issue.region.start.line - 1,
      issue.region.start.column === 0
        ? issue.region.start.column
        : issue.region.start.column - 1,
      issue.region.end.line === 0
        ? issue.region.end.line
        : issue.region.end.line - 1,
      issue.region.end.column === 0
        ? issue.region.end.column
        : issue.region.end.column - 1,
    );
    return Diagnostic.create(
      lineRange,
      issue.overview + " - " + issue.details.replace(/\[\d+m/g, ""),
      this.severityStringToDiagnosticSeverity(issue.type),
      undefined,
      "Elm",
    );
  }

  private severityStringToDiagnosticSeverity(
    severity: string,
  ): DiagnosticSeverity {
    switch (severity) {
      case "error":
        return DiagnosticSeverity.Error;
      case "warning":
        return DiagnosticSeverity.Warning;
      default:
        return DiagnosticSeverity.Error;
    }
  }
}
