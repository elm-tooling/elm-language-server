import path from "path";
import { container } from "tsyringe";
import {
  Connection,
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";
import { CapabilityCalculator } from "./capabilityCalculator";
import { Program, IProgram, IProgramHost } from "./compiler/program";
import {
  CodeActionProvider,
  CodeLensProvider,
  CompletionProvider,
  DefinitionProvider,
  DiagnosticsProvider,
  DocumentFormattingProvider,
  DocumentSymbolProvider,
  ElmMakeDiagnostics,
  FoldingRangeProvider,
  HoverProvider,
  LinkedEditingRangesProvider,
  ReferencesProvider,
  RenameProvider,
  SelectionRangeProvider,
  WorkspaceSymbolProvider,
} from "./providers";
import { ElmLsDiagnostics } from "./providers/diagnostics/elmLsDiagnostics";
import { FileEventsHandler } from "./providers/handlers/fileEventsHandler";
import { Settings } from "./util/settings";
import { TextDocumentEvents } from "./util/textDocumentEvents";
import { FindTestsProvider } from "./providers/findTestsProvider";
import { ElmReviewDiagnostics } from "./providers/diagnostics/elmReviewDiagnostics";
import { VirtualFileProvider } from "./providers/virtualFileProvider";
import { IFileSystemHost, InitializationOptions } from "./types";
import * as installPackageCodeAction from "./providers/codeAction/installPackageCodeAction";

export interface ILanguageServer {
  readonly capabilities: InitializeResult;
  init(): Promise<void>;
  registerInitializedProviders(): void;
  initSuccessfull: boolean;
}

export class Server implements ILanguageServer {
  private connection: Connection;
  public initSuccessfull = false;
  private isVirtualFileSystem = false;

  constructor(
    private params: InitializeParams,
    private fileSystemHost: IFileSystemHost,
    initializationOptions: InitializationOptions,
  ) {
    this.connection = container.resolve("Connection");

    const uri = this.getWorkspaceUri(this.params);

    if (uri) {
      this.isVirtualFileSystem = uri.scheme !== "file";

      if (
        !fileSystemHost.readDirectorySync &&
        !initializationOptions.elmJsonFiles
      ) {
        this.connection.window.showErrorMessage(
          "Virtual file system is not supported.",
        );
        this.connection.console.error("Virtual file system is not supported");
        return;
      }

      const elmJsons =
        initializationOptions.elmJsonFiles?.map((uri) => URI.parse(uri)) ??
        fileSystemHost.readDirectorySync?.(
          uri,
          ["**/elm.json"],
          ["**/node_modules/**", "**/elm-stuff/**"],
        );

      if (!elmJsons) {
        this.connection.window.showErrorMessage(
          "Unable to find elm json files.",
        );
        return;
      }

      if (elmJsons.length > 0) {
        this.connection.console.info(
          `Found ${
            elmJsons.length
          } elm.json files for workspace ${uri.toString()}`,
        );
        const listOfElmJsonFolders = elmJsons.map((a) =>
          this.getElmJsonFolder(a),
        );
        const topLevelElmJsons: Map<string, URI> =
          this.findTopLevelFolders(listOfElmJsonFolders);
        this.connection.console.info(
          `Found ${
            topLevelElmJsons.size
          } unique elmWorkspaces for workspace ${uri.toString()}`,
        );

        const textDocuments = container.resolve(TextDocumentEvents);

        const programHost: IProgramHost = {
          ...fileSystemHost,
          readFile: async (uri) => {
            const textDocument = textDocuments.get(uri.toString());

            if (textDocument) {
              return textDocument.getText();
            }

            const result = await fileSystemHost.readFile(uri);
            return result;
          },
        };

        const elmWorkspaces: Program[] = [];
        topLevelElmJsons.forEach((elmWorkspace) => {
          elmWorkspaces.push(new Program(elmWorkspace, programHost));
        });
        container.register("ElmWorkspaces", {
          useValue: elmWorkspaces,
        });

        this.initSuccessfull = true;
      } else {
        this.connection.window.showErrorMessage(
          "No elm.json found. Please run 'elm init' in your main directory.",
        );
        this.connection.console.info(`No elm.json found`);
      }
    } else {
      this.connection.console.info(`No workspace was setup by the client`);
    }
  }

  get capabilities(): InitializeResult {
    const calculator: CapabilityCalculator =
      container.resolve(CapabilityCalculator);
    return {
      capabilities: calculator.capabilities,
    };
  }

  public async init(): Promise<void> {
    const progress = await this.connection.window.createWorkDoneProgress();
    progress.begin("Initializing workspace", 0, "Indexing");
    if (!this.initSuccessfull) {
      progress.done();
      return;
    }
    const elmWorkspaces = container.resolve<IProgram[]>("ElmWorkspaces");
    await Promise.all(
      elmWorkspaces
        .map((ws) => ({ ws, indexedPercent: 0 }))
        .map((indexingWs, _, all) =>
          indexingWs.ws.init((percent: number) => {
            // update progress for this workspace
            indexingWs.indexedPercent = percent;

            // report average progress across all workspaces
            const avgIndexed =
              all.reduce((sum, { indexedPercent }) => sum + indexedPercent, 0) /
              all.length;
            progress.report(avgIndexed, "Indexing");
          }),
        ),
    );
    progress.done();
  }

  public async registerInitializedProviders(): Promise<void> {
    const settings = container.resolve<Settings>("Settings");
    // We can now query the client for up to date settings
    settings.initFinished();

    const clientSettings = await settings.getClientSettings();

    container.register("ClientSettings", {
      useValue: clientSettings,
    });

    // these register calls rely on settings having been setup
    container.register(ElmMakeDiagnostics, {
      useValue: new ElmMakeDiagnostics(this.fileSystemHost),
    });

    container.register(ElmReviewDiagnostics, {
      useValue: new ElmReviewDiagnostics(this.fileSystemHost),
    });

    container.register(ElmLsDiagnostics, {
      useValue: new ElmLsDiagnostics(),
    });

    container.register(DiagnosticsProvider, {
      useValue: new DiagnosticsProvider(),
    });

    if (!this.isVirtualFileSystem) {
      container.register(DocumentFormattingProvider, {
        useValue: new DocumentFormattingProvider(this.fileSystemHost),
      });
    }

    new CodeActionProvider(this.fileSystemHost);

    new FoldingRangeProvider();
    new CompletionProvider();
    new HoverProvider();
    new DefinitionProvider();
    new ReferencesProvider();
    new DocumentSymbolProvider();
    new WorkspaceSymbolProvider();
    new CodeLensProvider();
    new SelectionRangeProvider();
    new RenameProvider();
    new FileEventsHandler();
    new LinkedEditingRangesProvider();

    new FindTestsProvider();
    new VirtualFileProvider();

    installPackageCodeAction.register(this.fileSystemHost);
  }

  private getElmJsonFolder(uri: URI): URI {
    return Utils.dirname(uri);
  }

  private findTopLevelFolders(listOfElmJsonFolders: URI[]): Map<string, URI> {
    const result: Map<string, URI> = new Map<string, URI>();
    listOfElmJsonFolders.forEach((uri) => {
      result.set(uri.fsPath, uri);
    });

    listOfElmJsonFolders.forEach((parentUri) => {
      listOfElmJsonFolders.forEach((childUri) => {
        const parentPath = parentUri.fsPath + path.sep;
        const childPath = childUri.fsPath + path.sep;
        if (parentPath !== childPath && childPath.startsWith(parentPath)) {
          result.delete(childUri.fsPath);
        }
      });
    });

    return result;
  }

  private getWorkspaceUri(params: InitializeParams): URI | null {
    if (params.workspaceFolders && params.workspaceFolders.length > 0) {
      return URI.parse(params.workspaceFolders[0].uri);
    } else if (params.rootUri) {
      return URI.parse(params.rootUri);
    } else if (params.rootPath) {
      return URI.file(params.rootPath);
    } else {
      return null;
    }
  }
}
