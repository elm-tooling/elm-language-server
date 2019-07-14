import { Diagnostic, IConnection, TextDocument } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { Settings } from "../../util/settings";
import { TextDocumentEvents } from "../../util/textDocumentEvents";
import { ElmAnalyseDiagnostics } from "./elmAnalyseDiagnostics";
import { ElmMakeDiagnostics } from "./elmMakeDiagnostics";
import { ElmTestDiagnostics } from "./elmTestDiagnostics";

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
  private elmTestDiagnostics: ElmTestDiagnostics;
  private elmAnalyseDiagnostics: ElmAnalyseDiagnostics;
  private currentDiagnostics: {
    elmMake: Map<string, Diagnostic[]>;
    elmAnalyse: Map<string, Diagnostic[]>;
    elmTest: Map<string, Diagnostic[]>;
  };

  constructor(
    connection: IConnection,
    private elmWorkspaceFolder: URI,
    events: TextDocumentEvents,
    settings: Settings,
    elmAnalyse: ElmAnalyseDiagnostics,
    elmMake: ElmMakeDiagnostics,
  ) {
    this.getDiagnosticsOnSaveOrOpen = this.getDiagnosticsOnSaveOrOpen.bind(
      this,
    );
    this.getDiagnosticsOnChange = this.getDiagnosticsOnChange.bind(this);
    this.newElmAnalyseDiagnostics = this.newElmAnalyseDiagnostics.bind(this);
    this.events = events;
    this.elmMakeDiagnostics = elmMake;
    this.elmAnalyseDiagnostics = elmAnalyse;

    this.connection = connection;
    this.elmTestDiagnostics = new ElmTestDiagnostics(
      connection,
      elmWorkspaceFolder,
      settings,
    );

    this.currentDiagnostics = {
      elmAnalyse: new Map(),
      elmMake: new Map(),
      elmTest: new Map(),
    };

    this.events.on("open", this.getDiagnosticsOnSaveOrOpen);
    this.events.on("change", this.getDiagnosticsOnChange);
    this.events.on("save", this.getDiagnosticsOnSaveOrOpen);
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

    for (const [uri, diagnostics] of this.currentDiagnostics.elmMake) {
      allDiagnostics.set(uri, diagnostics);
    }

    for (const [uri, diagnostics] of this.currentDiagnostics.elmTest) {
      const currentDiagnostics = allDiagnostics.get(uri) || [];
      if (currentDiagnostics.length === 0) {
        allDiagnostics.set(uri, diagnostics);
      }
    }

    for (const [uri, diagnostics] of this.currentDiagnostics.elmAnalyse) {
      const currentDiagnostics = allDiagnostics.get(uri) || [];
      if (currentDiagnostics.length === 0) {
        allDiagnostics.set(uri, diagnostics);
      }
    }

    for (const [uri, diagnostics] of allDiagnostics) {
      this.connection.sendDiagnostics({ uri, diagnostics });
    }
  }

  private async getDiagnosticsOnChange(document: TextDocument): Promise<void> {
    this.connection.console.info(
      "Diagnostics were requested due to a file change",
    );
    this.getDiagnostics(document, false);
  }

  private async getDiagnosticsOnSaveOrOpen(
    document: TextDocument,
  ): Promise<void> {
    this.connection.console.info(
      "Diagnostics were requested due to a file open or save",
    );
    this.getDiagnostics(document, true);
  }

  private async getDiagnostics(
    document: TextDocument,
    isSaveOrOpen: boolean,
  ): Promise<void> {
    const uri = URI.parse(document.uri);
    if (uri.toString().startsWith(this.elmWorkspaceFolder.toString())) {
      const text = document.getText();

      if (isSaveOrOpen) {
        this.currentDiagnostics.elmMake = await this.elmMakeDiagnostics.createDiagnostics(
          uri,
        );
      }

      const elmMakeDiagnosticsForCurrentFile = this.currentDiagnostics.elmMake.get(
        uri.toString(),
      );
      if (
        elmMakeDiagnosticsForCurrentFile &&
        elmMakeDiagnosticsForCurrentFile.length === 0
      ) {
        if (isSaveOrOpen) {
          this.currentDiagnostics.elmTest = await this.elmTestDiagnostics.createDiagnostics(
            uri,
          );
        }
        this.elmAnalyseDiagnostics.updateFile(uri, text);
      }

      this.sendDiagnostics();
    }
  }
}
