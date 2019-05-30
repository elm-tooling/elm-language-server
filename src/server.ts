import {
  Connection,
  IConnection,
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver";
import URI from "vscode-uri";
import { CapabilityCalculator } from "./capabilityCalculator";
import { Forest } from "./forest";
import { Imports } from "./imports";
import { ASTProvider } from "./providers/astProvider";
import { CodeLensProvider } from "./providers/codeLensProvider";
import { CompletionProvider } from "./providers/completionProvider";
import { DefinitionProvider } from "./providers/definitionProvider";
import { DiagnosticsProvider } from "./providers/diagnostics/diagnosticsProvider";
import { DocumentFormattingProvider } from "./providers/documentFormatingProvider";
import { DocumentSymbolProvider } from "./providers/documentSymbolProvider";
import { FoldingRangeProvider } from "./providers/foldingProvider";
import { HoverProvider } from "./providers/hoverProvider";
import { ReferencesProvider } from "./providers/referencesProvider";
import { RenameProvider } from "./providers/renameProvider";
import { WorkspaceSymbolProvider } from "./providers/workspaceSymbolProvider";
import { DocumentEvents } from "./util/documentEvents";
import { Settings } from "./util/settings";

export interface ILanguageServer {
  readonly capabilities: InitializeResult;
}

export class Server implements ILanguageServer {
  private calculator: CapabilityCalculator;

  constructor(connection: Connection, params: InitializeParams) {
    this.calculator = new CapabilityCalculator(params.capabilities);
    const forest = new Forest();
    const imports = new Imports();

    const elmWorkspaceFallback =
      // Add a trailing slash if not present
      params.rootUri && params.rootUri.replace(/\/?$/, "/");
    const elmWorkspace = URI.parse(
      params.initializationOptions.elmWorkspace || elmWorkspaceFallback,
    );

    const settings = new Settings(
      params.capabilities,
      params.initializationOptions,
    );

    if (elmWorkspace) {
      connection.console.info(`initializing - folder: "${elmWorkspace}"`);
      this.registerProviders(
        connection,
        forest,
        elmWorkspace,
        imports,
        settings,
      );
    } else {
      connection.console.info(`No workspace.`);
    }
  }

  get capabilities(): InitializeResult {
    return {
      capabilities: this.calculator.capabilities,
    };
  }

  private registerProviders(
    connection: IConnection,
    forest: Forest,
    elmWorkspace: URI,
    imports: Imports,
    settings: Settings,
  ): void {
    const documentEvents = new DocumentEvents(connection);
    // tslint:disable:no-unused-expression
    new ASTProvider(connection, forest, elmWorkspace, documentEvents, imports);
    new FoldingRangeProvider(connection, forest);
    new CompletionProvider(connection, forest, imports);
    new HoverProvider(connection, forest, imports);
    new DiagnosticsProvider(connection, elmWorkspace, documentEvents, settings);
    new DocumentFormattingProvider(
      connection,
      elmWorkspace,
      documentEvents,
      settings,
    );
    new DefinitionProvider(connection, forest, imports);
    new ReferencesProvider(connection, forest, imports);
    new DocumentSymbolProvider(connection, forest);
    new WorkspaceSymbolProvider(connection, forest);
    new CodeLensProvider(connection, forest);
    new RenameProvider(connection, forest, imports);
  }
}
