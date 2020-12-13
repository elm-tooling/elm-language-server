import { container, injectable } from "tsyringe";
import {
  CancellationToken,
  Connection,
  Diagnostic as LspDiagnostic,
  FileChangeType,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { ServerCancellationToken } from "../../cancellation";
import { IElmWorkspace } from "../../elmWorkspace";
import { GetDiagnosticsRequest } from "../../protocol";
import { UriString } from "../../uri";
import { Delayer } from "../../util/delayer";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { MultistepOperation } from "../../util/multistepOperation";
import { IClientSettings } from "../../util/settings";
import { TextDocumentEvents } from "../../util/textDocumentEvents";
import { Diagnostic } from "../../util/types/diagnostics";
import { ASTProvider } from "../astProvider";
import { DiagnosticSource } from "./diagnosticSource";
import { DiagnosticsRequest } from "./diagnosticsRequest";
import { ElmLsDiagnostics } from "./elmLsDiagnostics";
import { ElmMakeDiagnostics } from "./elmMakeDiagnostics";
import { DiagnosticKind, FileDiagnostics } from "./fileDiagnostics";

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

export interface IDiagnostic extends Omit<LspDiagnostic, "code"> {
  source: DiagnosticSource;
  data: {
    uri: URI;
    code: string;
  };
}

export function convertFromAnalyzerDiagnostic(diag: Diagnostic): IDiagnostic {
  return {
    message: diag.message,
    source: diag.source,
    severity: diag.severity,
    range: diag.range,
    data: {
      uri: diag.uri,
      code: diag.code,
    },
  };
}

class PendingDiagnostics extends Map<URI, number> {
  public getOrderedFiles(): URI[] {
    return Array.from(this.entries())
      .sort((a, b) => a[1] - b[1])
      .map((a) => a[0]);
  }
}

@injectable()
export class DiagnosticsProvider {
  private elmMakeDiagnostics: ElmMakeDiagnostics;
  private elmLsDiagnostics: ElmLsDiagnostics;
  private currentDiagnostics: Map<UriString, FileDiagnostics>;
  private events: TextDocumentEvents;
  private connection: Connection;
  private clientSettings: IClientSettings;
  private workspaces: IElmWorkspace[];
  private elmWorkspaceMatcher: ElmWorkspaceMatcher<URI>;
  private documentEvents: TextDocumentEvents;

  private pendingRequest: DiagnosticsRequest | undefined;
  private pendingDiagnostics: PendingDiagnostics;
  private diagnosticsDelayer: Delayer<any>;
  private diagnosticsOperation: MultistepOperation;
  private changeSeq = 0;

  constructor() {
    this.clientSettings = container.resolve("ClientSettings");

    this.elmMakeDiagnostics = container.resolve(ElmMakeDiagnostics);
    this.elmLsDiagnostics = container.resolve(ElmLsDiagnostics);
    this.documentEvents = container.resolve(TextDocumentEvents);

    this.connection = container.resolve("Connection");
    this.events = container.resolve(TextDocumentEvents);
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((uri) => uri);
    this.diagnosticsOperation = new MultistepOperation(this.connection);

    this.workspaces = container.resolve("ElmWorkspaces");

    const astProvider = container.resolve(ASTProvider);

    this.currentDiagnostics = new Map<UriString, FileDiagnostics>();
    this.pendingDiagnostics = new PendingDiagnostics();
    this.diagnosticsDelayer = new Delayer(300);

    this.events.on(
      "open",
      (d: { document: TextDocument }) =>
        void this.getElmMakeDiagnostics(URI.parse(d.document.uri)),
    );
    this.events.on(
      "save",
      (d: { document: TextDocument }) =>
        void this.getElmMakeDiagnostics(URI.parse(d.document.uri)),
    );

    this.connection.onDidChangeWatchedFiles((event) => {
      const newDeleteEvents = event.changes
        .filter((a) => a.type === FileChangeType.Deleted)
        .map((a) => URI.parse(a.uri));
      newDeleteEvents.forEach((uri) => {
        this.deleteDiagnostics(uri);
      });
    });

    const clientInitiatedDiagnostics =
      this.clientSettings.extendedCapabilities?.clientInitiatedDiagnostics ??
      false;

    if (clientInitiatedDiagnostics) {
      this.connection.onRequest(
        GetDiagnosticsRequest,
        (params, cancellationToken) =>
          this.getDiagnostics(
            params.files.map((a) => URI.parse(a)),
            params.delay,
            cancellationToken,
          ),
      );
    }

    this.connection.onDidChangeConfiguration((params) => {
      this.clientSettings = <IClientSettings>params.settings;

      if (this.clientSettings.disableElmLSDiagnostics) {
        this.currentDiagnostics.forEach((_, uri) =>
          this.updateDiagnostics(URI.parse(uri), DiagnosticKind.ElmLS, []),
        );
      } else {
        this.workspaces.forEach((workspace) => {
          workspace.getForest().treeMap.forEach((treeContainer) => {
            if (treeContainer.writeable) {
              this.updateDiagnostics(
                treeContainer.uri,
                DiagnosticKind.ElmLS,
                this.elmLsDiagnostics.createDiagnostics(
                  treeContainer,
                  workspace,
                ),
              );
            }
          });
        });
      }
    });

    if (!clientInitiatedDiagnostics) {
      this.requestAllDiagnostics();
    }

    astProvider.onTreeChange(({ treeContainer, declaration }) => {
      if (!clientInitiatedDiagnostics) {
        this.requestDiagnostics(treeContainer.uri);
      }
    });

    this.documentEvents.on("change", () => {
      this.change();

      // We need to cancel the request as soon as possible
      if (!clientInitiatedDiagnostics) {
        if (this.pendingRequest) {
          this.pendingRequest.cancel();
          this.pendingRequest = undefined;
        }
      }
    });
  }

  public interruptDiagnostics<T>(f: () => T): T {
    if (!this.pendingRequest) {
      return f();
    }

    this.pendingRequest.cancel();
    this.pendingRequest = undefined;
    const result = f();

    this.triggerDiagnostics();
    return result;
  }

  public getCurrentDiagnostics(uri: URI): IDiagnostic[] {
    return this.currentDiagnostics.get(uri.toString())?.get() ?? [];
  }

  private requestDiagnostics(uri: URI): void {
    this.pendingDiagnostics.set(uri, Date.now());
    this.triggerDiagnostics();
  }

  private requestAllDiagnostics(): void {
    this.workspaces.forEach((workspace) => {
      workspace.getForest().treeMap.forEach(({ uri, writeable }) => {
        if (writeable) {
          this.pendingDiagnostics.set(uri, Date.now());
        }
      });
    });

    this.triggerDiagnostics();
  }
  private triggerDiagnostics(delay = 200): void {
    const sendPendingDiagnostics = (): void => {
      const orderedFiles = this.pendingDiagnostics.getOrderedFiles();

      if (this.pendingRequest) {
        this.pendingRequest.cancel();

        this.pendingRequest.files.forEach((file) => {
          if (!orderedFiles.includes(file)) {
            orderedFiles.push(file);
          }
        });

        this.pendingRequest = undefined;
      }

      // Add all open files to request
      const openFiles = this.events.getManagedUris();
      openFiles.forEach((file) => {
        if (!orderedFiles.includes(file)) {
          orderedFiles.push(file);
        }
      });

      if (orderedFiles.length) {
        const request = (this.pendingRequest = DiagnosticsRequest.execute(
          this.getDiagnostics.bind(this),
          orderedFiles,
          () => {
            if (request === this.pendingRequest) {
              this.pendingRequest = undefined;
            }
          },
        ));
      }

      this.pendingDiagnostics.clear();
    };

    void this.diagnosticsDelayer.trigger(sendPendingDiagnostics, delay);
  }

  private updateDiagnostics(
    uri: URI,
    kind: DiagnosticKind,
    diagnostics: IDiagnostic[],
  ): void {
    let didUpdate = false;

    let fileDiagnostics = this.currentDiagnostics.get(uri.toString());

    if (fileDiagnostics) {
      didUpdate = fileDiagnostics.update(kind, diagnostics);
    } else if (diagnostics.length > 0) {
      fileDiagnostics = new FileDiagnostics(uri);
      fileDiagnostics.update(kind, diagnostics);
      this.currentDiagnostics.set(uri.toString(), fileDiagnostics);
      didUpdate = true;
    }

    if (didUpdate) {
      const fileDiagnostics = this.currentDiagnostics.get(uri.toString());
      this.connection.sendDiagnostics({
        uri: uri.toString(),
        diagnostics: fileDiagnostics ? fileDiagnostics.get() : [],
      });
    }
  }

  private deleteDiagnostics(uri: URI): void {
    this.currentDiagnostics.delete(uri.toString());
    this.connection.sendDiagnostics({
      uri: uri.toString(),
      diagnostics: [],
    });
  }

  private getDiagnostics(
    files: URI[],
    delay: number,
    cancellationToken: CancellationToken,
  ): Promise<void> {
    const followMs = Math.min(delay, 200);
    const serverCancellationToken = new ServerCancellationToken(
      cancellationToken,
    );

    return new Promise((resolve) =>
      this.diagnosticsOperation.startNew(
        cancellationToken,
        (next) => {
          const seq = this.changeSeq;

          let index = 0;
          const goNext = (): void => {
            index++;
            if (files.length > index) {
              next.delay(followMs, checkOne);
            }
          };

          const checkOne = (): void => {
            if (this.changeSeq !== seq) {
              return;
            }

            const uri = files[index];
            const program = this.elmWorkspaceMatcher.getProgramFor(uri);

            const sourceFile = program.getForest().getByUri(uri);

            if (!sourceFile) {
              goNext();
              return;
            }

            next.immediate(() => {
              this.updateDiagnostics(uri, DiagnosticKind.ElmMake, []);
              this.updateDiagnostics(
                uri,
                DiagnosticKind.Syntactic,
                program
                  .getSyntacticDiagnostics(sourceFile)
                  .map(convertFromAnalyzerDiagnostic),
              );

              if (this.changeSeq !== seq) {
                return;
              }

              next.promise(async () => {
                const diagnostics = await program.getSemanticDiagnosticsAsync(
                  sourceFile,
                  serverCancellationToken,
                );

                if (this.changeSeq !== seq) {
                  return;
                }

                this.updateDiagnostics(
                  uri,
                  DiagnosticKind.Semantic,
                  diagnostics.map(convertFromAnalyzerDiagnostic),
                );

                next.immediate(() => {
                  this.updateDiagnostics(
                    uri,
                    DiagnosticKind.Suggestion,
                    program
                      .getSuggestionDiagnostics(
                        sourceFile,
                        serverCancellationToken,
                      )
                      .map(convertFromAnalyzerDiagnostic),
                  );

                  if (this.changeSeq !== seq) {
                    return;
                  }

                  next.immediate(() => {
                    this.updateDiagnostics(
                      uri,
                      DiagnosticKind.ElmLS,
                      this.elmLsDiagnostics.createDiagnostics(
                        sourceFile,
                        program,
                      ),
                    );

                    goNext();
                  });
                });
              });
            });
          };

          if (files.length > 0 && this.changeSeq === seq) {
            next.delay(delay, checkOne);
          }
        },
        resolve,
      ),
    );
  }

  private async getElmMakeDiagnostics(uri: URI): Promise<void> {
    const elmMakeDiagnostics = await this.elmMakeDiagnostics.createDiagnostics(
      uri,
    );

    this.resetDiagnostics(elmMakeDiagnostics, DiagnosticKind.ElmMake);

    elmMakeDiagnostics.forEach((diagnostics, uri) => {
      const diagnosticsUri = URI.parse(uri);
      this.updateDiagnostics(diagnosticsUri, DiagnosticKind.Syntactic, []);
      this.updateDiagnostics(diagnosticsUri, DiagnosticKind.Semantic, []);
      this.updateDiagnostics(
        diagnosticsUri,
        DiagnosticKind.ElmMake,
        diagnostics,
      );
    });

    this.currentDiagnostics.forEach((_, uri) => {
      if (!elmMakeDiagnostics.has(uri)) {
        this.updateDiagnostics(URI.parse(uri), DiagnosticKind.ElmMake, []);
      }
    });
  }

  private resetDiagnostics(
    diagnosticList: Map<UriString, IDiagnostic[]>,
    diagnosticKind: DiagnosticKind,
  ): void {
    this.currentDiagnostics.forEach((fileDiagnostics, diagnosticsUri) => {
      if (
        !diagnosticList.has(diagnosticsUri.toString()) &&
        fileDiagnostics.getForKind(diagnosticKind).length > 0
      ) {
        diagnosticList.set(diagnosticsUri.toString(), []);
      }
    });
  }

  private change(): void {
    this.changeSeq++;
  }
}
