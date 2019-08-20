import { Diagnostic, IConnection, TextDocument } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { ElmAnalyseTrigger, Settings } from "../../util/settings";
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
  private elmMakeDiagnostics: ElmMakeDiagnostics;
  private elmAnalyseDiagnostics: ElmAnalyseDiagnostics | null;
  private currentDiagnostics: {
    elmMake: Map<string, Diagnostic[]>;
    elmAnalyse: Map<string, Diagnostic[]>;
    elmTest: Map<string, Diagnostic[]>;
  };

  constructor(
    private connection: IConnection,
    private elmWorkspaceFolder: URI,
    private settings: Settings,
    private events: TextDocumentEvents,
    elmAnalyse: ElmAnalyseDiagnostics | null,
    elmMake: ElmMakeDiagnostics,
  ) {
    this.newElmAnalyseDiagnostics = this.newElmAnalyseDiagnostics.bind(this);
    this.elmMakeDiagnostics = elmMake;
    this.elmAnalyseDiagnostics = elmAnalyse;

    this.currentDiagnostics = {
      elmAnalyse: new Map(),
      elmMake: new Map(),
      elmTest: new Map(),
    };

    // register onChange listener if settings are not on-save only
    this.settings.getClientSettings().then(({ elmAnalyseTrigger }) => {
      this.events.on("open", d =>
        this.getDiagnostics(d, true, elmAnalyseTrigger),
      );
      this.events.on("save", d =>
        this.getDiagnostics(d, true, elmAnalyseTrigger),
      );
      if (this.elmAnalyseDiagnostics) {
        this.elmAnalyseDiagnostics.on(
          "new-diagnostics",
          this.newElmAnalyseDiagnostics,
        );
      }
      if (elmAnalyseTrigger === "change") {
        this.events.on("change", d =>
          this.getDiagnostics(d, false, elmAnalyseTrigger),
        );
      }
    });
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

  private async getDiagnostics(
    document: TextDocument,
    isSaveOrOpen: boolean,
    elmAnalyseTrigger: ElmAnalyseTrigger,
  ): Promise<void> {
    this.connection.console.info(
      `Diagnostics were requested due to a file ${
        isSaveOrOpen ? "open or save" : "change"
      }`,
    );

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
        this.elmAnalyseDiagnostics &&
        elmAnalyseTrigger !== "never" &&
        elmMakeDiagnosticsForCurrentFile &&
        elmMakeDiagnosticsForCurrentFile.length === 0
      ) {
        this.elmAnalyseDiagnostics.updateFile(uri, text);
      }

      this.sendDiagnostics();
    }
  }
}
