import globby from "globby";
import path from "path";
import { container } from "tsyringe";
import {
  Connection,
  InitializeParams,
  InitializeResult,
  WorkDoneProgressReporter,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { CapabilityCalculator } from "./capabilityCalculator";
import { ElmWorkspace, IElmWorkspace } from "./elmWorkspace";
import {
  ASTProvider,
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
  ReferencesProvider,
  RenameProvider,
  SelectionRangeProvider,
  WorkspaceSymbolProvider,
} from "./providers";
import { ElmLsDiagnostics } from "./providers/diagnostics/elmLsDiagnostics";
import { Settings } from "./util/settings";

export interface ILanguageServer {
  readonly capabilities: InitializeResult;
  init(): Promise<void>;
  registerInitializedProviders(): void;
}

export class Server implements ILanguageServer {
  private connection: Connection;

  constructor(
    params: InitializeParams,
    private progress: WorkDoneProgressReporter,
  ) {
    this.connection = container.resolve("Connection");

    const uri = this.getWorkspaceUri(params);

    if (uri) {
      // Cleanup the path on windows, as globby does not like backslashes
      const globUri = uri.fsPath.replace(/\\/g, "/");
      const elmJsonGlob = `${globUri}/**/elm.json`;

      const elmJsons = globby.sync(
        [elmJsonGlob, "!**/node_modules/**", "!**/elm-stuff/**"],
        { suppressErrors: true },
      );
      if (elmJsons.length > 0) {
        this.connection.console.info(
          `Found ${elmJsons.length} elm.json files for workspace ${globUri}`,
        );
        const listOfElmJsonFolders = elmJsons.map((a) =>
          this.getElmJsonFolder(a),
        );
        const topLevelElmJsons: Map<string, URI> = this.findTopLevelFolders(
          listOfElmJsonFolders,
        );
        this.connection.console.info(
          `Found ${topLevelElmJsons.size} unique elmWorkspaces for workspace ${globUri}`,
        );

        const elmWorkspaces: ElmWorkspace[] = [];
        topLevelElmJsons.forEach((elmWorkspace) => {
          elmWorkspaces.push(new ElmWorkspace(elmWorkspace));
        });
        container.register("ElmWorkspaces", {
          useValue: elmWorkspaces,
        });
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
    const calculator: CapabilityCalculator = container.resolve(
      CapabilityCalculator,
    );
    return {
      capabilities: calculator.capabilities,
    };
  }

  public async init(): Promise<void> {
    this.progress.begin("Indexing Elm", 0);
    const elmWorkspaces = container.resolve<IElmWorkspace[]>("ElmWorkspaces");
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
            this.progress.report(avgIndexed, `${Math.round(avgIndexed)}%`);
          }),
        ),
    );
    this.progress.done();
  }

  public async registerInitializedProviders(): Promise<void> {
    const settings = container.resolve<Settings>("Settings");
    // We can now query the client for up to date settings
    settings.initFinished();

    const clientSettings = await settings.getClientSettings();

    container.register("ClientSettings", {
      useValue: clientSettings,
    });

    container.register(ASTProvider, {
      useValue: new ASTProvider(),
    });

    container.register(DiagnosticsProvider, {
      useValue: new DiagnosticsProvider(),
    });

    // these register calls rely on settings having been setup
    container.register(DocumentFormattingProvider, {
      useValue: new DocumentFormattingProvider(),
    });

    container.register(ElmMakeDiagnostics, {
      useValue: new ElmMakeDiagnostics(),
    });

    container.register(ElmLsDiagnostics, {
      useValue: new ElmLsDiagnostics(),
    });

    new CodeActionProvider();

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
  }

  private getElmJsonFolder(uri: string): URI {
    return URI.file(path.dirname(uri));
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
    if (params.rootUri) {
      return URI.parse(params.rootUri);
    } else if (params.rootPath) {
      return URI.file(params.rootPath);
    } else {
      return null;
    }
  }
}
