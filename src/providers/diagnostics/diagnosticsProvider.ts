import { IClientSettings, Settings } from "src/util/settings";
import { container, injectable } from "tsyringe";
import { Diagnostic, FileChangeType, IConnection } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { ElmAnalyseDiagnostics } from "..";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { NoWorkspaceContainsError } from "../../util/noWorkspaceContainsError";
import { ElmAnalyseTrigger } from "../../util/settings";
import { TextDocumentEvents } from "../../util/textDocumentEvents";
import { ElmMakeDiagnostics } from "./elmMakeDiagnostics";
import { TypeInferenceDiagnostics } from "./typeInferenceDiagnostics";
import { ASTProvider } from "../astProvider";

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

@injectable()
export class DiagnosticsProvider {
  private elmMakeDiagnostics: ElmMakeDiagnostics;
  private elmAnalyseDiagnostics: ElmAnalyseDiagnostics | null = null;
  private typeInferenceDiagnostics: TypeInferenceDiagnostics;
  private elmWorkspaceMatcher: ElmWorkspaceMatcher<{ uri: string }>;
  private currentDiagnostics: {
    elmMake: Map<string, Diagnostic[]>;
    elmAnalyse: Map<string, Diagnostic[]>;
    elmTest: Map<string, Diagnostic[]>;
    typeInference: Map<string, Diagnostic[]>;
  };
  private events: TextDocumentEvents;
  private connection: IConnection;
  private settings: Settings;
  private clientSettings: IClientSettings;

  constructor() {
    this.settings = container.resolve("Settings");
    this.clientSettings = container.resolve("ClientSettings");
    if (this.clientSettings.elmAnalyseTrigger !== "never") {
      this.elmAnalyseDiagnostics = container.resolve<ElmAnalyseDiagnostics | null>(
        ElmAnalyseDiagnostics,
      );
    }
    this.elmMakeDiagnostics = container.resolve<ElmMakeDiagnostics>(
      ElmMakeDiagnostics,
    );
    this.typeInferenceDiagnostics = container.resolve<TypeInferenceDiagnostics>(
      TypeInferenceDiagnostics,
    );
    this.settings = container.resolve("Settings");
    this.connection = container.resolve<IConnection>("Connection");
    this.events = container.resolve<TextDocumentEvents>(TextDocumentEvents);
    this.newElmAnalyseDiagnostics = this.newElmAnalyseDiagnostics.bind(this);
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((doc) =>
      URI.parse(doc.uri),
    );

    const astProvider = container.resolve<ASTProvider>(ASTProvider);

    this.currentDiagnostics = {
      elmAnalyse: new Map(),
      elmMake: new Map(),
      elmTest: new Map(),
      typeInference: new Map(),
    };
    // register onChange listener if settings are not on-save only
    void this.settings.getClientSettings().then(({ elmAnalyseTrigger }) => {
      this.events.on("open", (d) =>
        this.getDiagnostics(d, true, elmAnalyseTrigger),
      );
      this.events.on("save", (d) =>
        this.getDiagnostics(d, true, elmAnalyseTrigger),
      );
      this.connection.onDidChangeWatchedFiles((event) => {
        const newDeleteEvents = event.changes
          .filter((a) => a.type === FileChangeType.Deleted)
          .map((a) => a.uri);
        newDeleteEvents.forEach((uri) => {
          this.currentDiagnostics.elmAnalyse.delete(uri);
          this.currentDiagnostics.elmMake.delete(uri);
          this.currentDiagnostics.elmTest.delete(uri);
          this.currentDiagnostics.typeInference.delete(uri);
        });
        this.sendDiagnostics();
      });
      if (this.elmAnalyseDiagnostics) {
        this.elmAnalyseDiagnostics.on(
          "new-diagnostics",
          this.newElmAnalyseDiagnostics,
        );
      }
      if (elmAnalyseTrigger === "change") {
        this.events.on("change", (d) =>
          this.getDiagnostics(d, false, elmAnalyseTrigger),
        );
      }

      astProvider.onTreeChange(({ uri, tree }) => {
        let workspace;
        try {
          workspace = this.elmWorkspaceMatcher.getElmWorkspaceFor({ uri });
        } catch (error) {
          if (error instanceof NoWorkspaceContainsError) {
            this.connection.console.info(error.message);
            return; // ignore file that doesn't correspond to a workspace
          }

          throw error;
        }

        this.currentDiagnostics.typeInference = this.typeInferenceDiagnostics.createDiagnostics(
          tree,
          uri,
          workspace,
        );

        this.sendDiagnostics();
      });
    });
  }

  private newElmAnalyseDiagnostics(
    diagnostics: Map<string, Diagnostic[]>,
  ): void {
    this.currentDiagnostics.elmAnalyse = diagnostics;
    this.sendDiagnostics();
  }

  private sendDiagnostics(): void {
    const allDiagnostics = new Map<string, Diagnostic[]>();

    for (const [uri, diagnostics] of this.currentDiagnostics.elmMake) {
      allDiagnostics.set(uri, diagnostics);
    }

    for (const [uri, diagnostics] of this.currentDiagnostics.elmTest) {
      const currentDiagnostics = allDiagnostics.get(uri) ?? [];
      if (currentDiagnostics.length === 0) {
        allDiagnostics.set(uri, diagnostics);
      }
    }

    for (const [uri, diagnostics] of this.currentDiagnostics.typeInference) {
      const currentDiagnostics = allDiagnostics.get(uri) ?? [];
      if (currentDiagnostics.length === 0) {
        allDiagnostics.set(uri, diagnostics);
      }
    }

    for (const [uri, diagnostics] of this.currentDiagnostics.elmAnalyse) {
      const currentDiagnostics = allDiagnostics.get(uri) ?? [];
      if (currentDiagnostics.length === 0) {
        allDiagnostics.set(uri, diagnostics);
      }
    }

    for (const [uri, diagnostics] of allDiagnostics) {
      this.connection.sendDiagnostics({ uri, diagnostics });
    }
  }

  private async getDiagnostics(
    { document }: { document: TextDocument },
    isSaveOrOpen: boolean,
    elmAnalyseTrigger: ElmAnalyseTrigger,
  ): Promise<void> {
    this.connection.console.info(
      `Diagnostics were requested due to a file ${
        isSaveOrOpen ? "open or save" : "change"
      }`,
    );

    const uri = URI.parse(document.uri);
    let workspace;
    try {
      workspace = this.elmWorkspaceMatcher.getElmWorkspaceFor(document);
    } catch (error) {
      if (error instanceof NoWorkspaceContainsError) {
        this.connection.console.info(error.message);
        return; // ignore file that doesn't correspond to a workspace
      }

      throw error;
    }

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
      (!elmMakeDiagnosticsForCurrentFile ||
        (elmMakeDiagnosticsForCurrentFile &&
          elmMakeDiagnosticsForCurrentFile.length === 0))
    ) {
      await this.elmAnalyseDiagnostics.updateFile(uri, text);
    }

    this.sendDiagnostics();
  }
}
