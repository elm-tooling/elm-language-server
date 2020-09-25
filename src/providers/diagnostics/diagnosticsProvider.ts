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
import { IElmWorkspace } from "src/elmWorkspace";

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
  private workspaces: IElmWorkspace[];

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
    this.connection = container.resolve<IConnection>("Connection");
    this.events = container.resolve<TextDocumentEvents>(TextDocumentEvents);
    this.newElmAnalyseDiagnostics = this.newElmAnalyseDiagnostics.bind(this);
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((doc) =>
      URI.parse(doc.uri),
    );
    this.workspaces = container.resolve("ElmWorkspaces");

    const astProvider = container.resolve<ASTProvider>(ASTProvider);

    this.currentDiagnostics = {
      elmAnalyse: new Map<string, Diagnostic[]>(),
      elmMake: new Map<string, Diagnostic[]>(),
      elmTest: new Map<string, Diagnostic[]>(),
      typeInference: new Map<string, Diagnostic[]>(),
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

      this.workspaces.forEach((workspace) => {
        workspace.getForest().treeIndex.forEach((treeContainer) => {
          if (treeContainer.writeable) {
            const treeDiagnostics = this.typeInferenceDiagnostics.createDiagnostics(
              treeContainer.tree,
              treeContainer.uri,
              workspace,
            );

            this.currentDiagnostics.typeInference.set(
              treeContainer.uri,
              treeDiagnostics,
            );
          }
        });
      });

      this.sendDiagnostics();

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

        this.currentDiagnostics.typeInference.set(
          uri,
          this.typeInferenceDiagnostics.createDiagnostics(tree, uri, workspace),
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

  private addOrMergeDiagnostics(
    map1: Map<string, Diagnostic[]>,
    map2: Map<string, Diagnostic[]>,
  ): Map<string, Diagnostic[]> {
    const result = new Map<string, Diagnostic[]>(map1);

    for (const key of map2.keys()) {
      const value = map2.get(key);

      if (value) {
        if (map1.has(key)) {
          const value1 = map1.get(key);
          if (value1) {
            result.set(key, [...value, ...value1]);
          }
        } else {
          result.set(key, value);
        }
      }
    }

    return result;
  }

  private sendDiagnostics(): void {
    let allDiagnostics = new Map<string, Diagnostic[]>();

    allDiagnostics = this.addOrMergeDiagnostics(
      allDiagnostics,
      this.currentDiagnostics.elmMake,
    );

    allDiagnostics = this.addOrMergeDiagnostics(
      allDiagnostics,
      this.currentDiagnostics.elmTest,
    );

    allDiagnostics = this.addOrMergeDiagnostics(
      allDiagnostics,
      this.currentDiagnostics.elmAnalyse,
    );

    allDiagnostics = this.addOrMergeDiagnostics(
      allDiagnostics,
      this.currentDiagnostics.typeInference,
    );

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
