import {
  Diagnostic,
  DiagnosticSeverity,
  IConnection,
  Range,
  TextDocument,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { Settings } from "../../util/settings";
import { TextDocumentEvents } from "../../util/textDocumentEvents";
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
  private connection: IConnection;
  private events: TextDocumentEvents;
  private elmMakeDiagnostics: ElmMakeDiagnostics;
  private elmAnalyseDiagnostics: ElmAnalyseDiagnostics;
  private currentDiagnostics: {
    elmMake: Map<string, Diagnostic[]>;
    elmAnalyse: Map<string, Diagnostic[]>;
  };

  constructor(
    connection: IConnection,
    elmWorkspaceFolder: URI,
    events: TextDocumentEvents,
    settings: Settings,
    elmAnalyse: ElmAnalyseDiagnostics,
  ) {
    this.getDiagnostics = this.getDiagnostics.bind(this);
    this.newElmAnalyseDiagnostics = this.newElmAnalyseDiagnostics.bind(this);
    this.elmMakeIssueToDiagnostic = this.elmMakeIssueToDiagnostic.bind(this);
    this.events = events;
    this.elmAnalyseDiagnostics = elmAnalyse;

    this.connection = connection;
    this.elmMakeDiagnostics = new ElmMakeDiagnostics(
      connection,
      elmWorkspaceFolder,
      settings,
    );

    this.currentDiagnostics = { elmMake: new Map(), elmAnalyse: new Map() };

    this.events.on("open", this.getDiagnostics);
    this.events.on("change", this.getDiagnostics);
    this.events.on("save", this.getDiagnostics);
    this.elmAnalyseDiagnostics.on(
      "new-diagnostics",
      this.newElmAnalyseDiagnostics,
    );
  }

  private newElmAnalyseDiagnostics(diagnostics: Map<string, Diagnostic[]>) {
    this.currentDiagnostics.elmAnalyse = diagnostics;
    this.sendDiagnostics();
  }

  private sendDiagnostics() {
    const allDiagnostics: Map<string, Diagnostic[]> = new Map();
    for (const [uri, diagnostics] of this.currentDiagnostics.elmAnalyse) {
      allDiagnostics.set(uri, diagnostics);
    }

    for (const [uri, diagnostics] of this.currentDiagnostics.elmMake) {
      allDiagnostics.set(
        uri,
        (allDiagnostics.get(uri) || []).concat(diagnostics),
      );
    }

    for (const [uri, diagnostics] of allDiagnostics) {
      this.connection.sendDiagnostics({ uri, diagnostics });
    }
  }

  private async getDiagnostics(document: TextDocument): Promise<void> {
    const uri = URI.parse(document.uri);
    const text = document.getText();

    this.elmAnalyseDiagnostics.updateFile(uri, text);

    this.currentDiagnostics.elmMake = await this.elmMakeDiagnostics.createDiagnostics(
      uri,
    );
    this.sendDiagnostics();
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
      `${issue.overview} - ${issue.details.replace(/\[\d+m/g, "")}`,
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
