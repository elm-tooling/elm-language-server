import globby from "globby";
import path from "path";
import {
  InitializeParams,
  InitializeResult,
  IConnection,
} from "vscode-languageserver";
import { WorkDoneProgress } from "vscode-languageserver/lib/progress";
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
  ElmAnalyseDiagnostics,
  ElmMakeDiagnostics,
  FoldingRangeProvider,
  HoverProvider,
  ReferencesProvider,
  RenameProvider,
  SelectionRangeProvider,
  WorkspaceSymbolProvider,
} from "./providers";
import { DocumentEvents } from "./util/documentEvents";
import { Settings } from "./util/settings";
import { TextDocumentEvents } from "./util/textDocumentEvents";
import { container, DependencyContainer } from "tsyringe";

export interface ILanguageServer {
  readonly capabilities: InitializeResult;
  init(): Promise<void>;
  registerInitializedProviders(): void;
}

export class Server implements ILanguageServer {
  private calculator: CapabilityCalculator;
  private settings: Settings;
  private workspaceChildContainer: DependencyContainer;
  private connection: IConnection;

  constructor(
    private params: InitializeParams,
    private progress: WorkDoneProgress,
  ) {
    this.connection = container.resolve("Connection");
    this.workspaceChildContainer = container.createChildContainer();
    this.calculator = new CapabilityCalculator(params.capabilities);
    const initializationOptions = this.params.initializationOptions ?? {};

    this.workspaceChildContainer.register("Settings", {
      useValue: new Settings(initializationOptions, params.capabilities),
    });

    this.settings = this.workspaceChildContainer.resolve("Settings");

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
          elmWorkspaces.push(new ElmWorkspace(elmWorkspace, this.settings));
        });
        this.workspaceChildContainer.register("ElmWorkspaces", {
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
    return {
      capabilities: this.calculator.capabilities,
    };
  }

  public async init(): Promise<void> {
    this.progress.begin("Indexing Elm", 0);
    const elmWorkspaces = this.workspaceChildContainer.resolve<IElmWorkspace[]>(
      "ElmWorkspaces",
    );
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
    // We can now query the client for up to date settings
    this.settings.initFinished();

    this.workspaceChildContainer.registerSingleton(
      "DocumentEvents",
      DocumentEvents,
    );
    this.workspaceChildContainer.register(TextDocumentEvents, {
      useValue: new TextDocumentEvents(this.workspaceChildContainer),
    });
    this.workspaceChildContainer.register(DocumentFormattingProvider, {
      useValue: new DocumentFormattingProvider(this.workspaceChildContainer),
    });

    const settings = await this.settings.getClientSettings();

    const elmAnalyse =
      settings.elmAnalyseTrigger !== "never"
        ? new ElmAnalyseDiagnostics(this.workspaceChildContainer)
        : null;

    const elmMake = new ElmMakeDiagnostics(this.workspaceChildContainer);

    new DiagnosticsProvider(elmAnalyse, elmMake, this.workspaceChildContainer);

    new CodeActionProvider(elmAnalyse, elmMake, this.workspaceChildContainer);

    new ASTProvider(this.workspaceChildContainer);

    new FoldingRangeProvider(this.workspaceChildContainer);
    new CompletionProvider(this.workspaceChildContainer);
    new HoverProvider(this.workspaceChildContainer);
    new DefinitionProvider(this.workspaceChildContainer);
    new ReferencesProvider(this.workspaceChildContainer);
    new DocumentSymbolProvider(this.workspaceChildContainer);
    new WorkspaceSymbolProvider(this.workspaceChildContainer);
    new CodeLensProvider(this.workspaceChildContainer);
    new SelectionRangeProvider(this.workspaceChildContainer);
    new RenameProvider(this.workspaceChildContainer);
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
