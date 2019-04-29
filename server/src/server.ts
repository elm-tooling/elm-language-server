import {
  Connection,
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver";
import URI from "vscode-uri";
import { CapabilityCalculator } from "./capabilityCalculator";
import { Forest } from "./forest";
import { ASTProvider } from "./providers/astProvider";
import { CodeLensProvider } from "./providers/codeLensProvider";
import { CompletionProvider } from "./providers/completionProvider";
import { DefinitionProvider } from "./providers/definitionProvider";
import { DiagnosticsProvider } from "./providers/diagnostics/diagnosticsProvider";
import { DocumentSymbolProvider } from "./providers/documentSymbolProvider";
import { ElmFormatProvider } from "./providers/elmFormatProvider";
import { FoldingRangeProvider } from "./providers/foldingProvider";
import { HoverProvider } from "./providers/hoverProvider";
import { ReferencesProvider } from "./providers/referencesProvider";
import { RenameProvider } from "./providers/renameProvider";
import { WorkspaceSymbolProvider } from "./providers/workspaceSymbolProvider";

export interface ILanguageServer {
  readonly capabilities: InitializeResult;
}

export class Server implements ILanguageServer {
  private calculator: CapabilityCalculator;

  constructor(connection: Connection, params: InitializeParams) {
    this.calculator = new CapabilityCalculator(params.capabilities);
    const forest = new Forest();

    const elmWorkspaceFallback =
      // Add a trailing slash if not present
      params.rootUri && params.rootUri.replace(/\/?$/, "/");
    const elmWorkspace = URI.parse(
      params.initializationOptions.elmWorkspace || elmWorkspaceFallback,
    );

    if (elmWorkspace) {
      connection.console.info(`[elm-ls] initializing - folder=${elmWorkspace}`);
      this.registerProviders(connection, forest, elmWorkspace);
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
    connection: Connection,
    forest: Forest,
    elmWorkspace: URI,
  ): void {
    // tslint:disable:no-unused-expression
    new ASTProvider(connection, forest, elmWorkspace);
    new FoldingRangeProvider(connection, forest);
    new CompletionProvider(connection, forest);
    new HoverProvider(connection, forest);
    new DiagnosticsProvider(connection, elmWorkspace);
    new ElmFormatProvider(connection, elmWorkspace);
    new DefinitionProvider(connection, forest);
    new ReferencesProvider(connection, forest);
    new DocumentSymbolProvider(connection, forest);
    new WorkspaceSymbolProvider(connection, forest);
    new CodeLensProvider(connection, forest);
    new RenameProvider(connection, forest);
  }
}
