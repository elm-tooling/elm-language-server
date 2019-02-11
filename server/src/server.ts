import { Connection, InitializeParams, InitializeResult, WorkspaceFolder } from "vscode-languageserver";
import URI from "vscode-uri";
import { CapabilityCalculator } from "./capabilityCalculator";
import { Forest } from "./forest";
import { ASTProvider } from "./providers/astProvider";
import { CompletionProvider } from "./providers/completionProvider";
import { DiagnosticsProvider } from "./providers/diagnosticsProvider";
import { ElmFormatProvider } from "./providers/elmFormatProvider";
import { FoldingRangeProvider } from "./providers/foldingProvider";

export interface ILanguageServer {
  readonly capabilities: InitializeResult;
}

export class Server implements ILanguageServer {
  private calculator: CapabilityCalculator;

  constructor(
    connection: Connection,
    params: InitializeParams,
  ) {
    this.calculator = new CapabilityCalculator(params.capabilities);
    if (params.workspaceFolders && params.workspaceFolders.length > 0) {
      const elmWorkspace = URI.parse(params.initializationOptions.elmJson);
      const forest = new Forest();
      const workspaceFolder = params.workspaceFolders[0];
      connection.console.info(`Initializing Elm language server for workspace
 ${workspaceFolder.uri} using ${elmWorkspace}`);
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

  private registerProviders(connection: Connection, forest: Forest, elmWorkspace: URI): void {
    // tslint:disable:no-unused-expression
    new ASTProvider(connection, forest);
    new FoldingRangeProvider(connection, forest);
    new CompletionProvider(connection, forest);
    new DiagnosticsProvider(connection, elmWorkspace);
    new ElmFormatProvider(connection, elmWorkspace);
  }
}
