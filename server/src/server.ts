import {
  Connection,
  InitializeParams,
  InitializeResult,
  WorkspaceFolder,
} from "vscode-languageserver";

import fs = require("fs");
import URI from "vscode-uri";
import { CapabilityCalculator } from "./capabilityCalculator";
import { Forest } from "./forest";
import { ASTProvider } from "./providers/astProvider";
import { CompletionProvider } from "./providers/completionProvider";
import { DiagnosticsProvider } from "./providers/diagnosticsProvider";
import { FoldingRangeProvider } from "./providers/foldingProvider";

export interface ILanguageServer {
  readonly capabilities: InitializeResult;
}

export class Server implements ILanguageServer {
  public connection: Connection;
  public workspaceFolders: WorkspaceFolder[];
  public elmWorkspaceFolder: URI;
  private calculator: CapabilityCalculator;
  private forest: Forest;

  constructor(
    connection: Connection,
    workspaceFolders: WorkspaceFolder[],
    params: InitializeParams,
  ) {
    this.connection = connection;
    this.workspaceFolders = workspaceFolders;
    this.elmWorkspaceFolder = this.findElmWorkspace();
    this.calculator = new CapabilityCalculator(params.capabilities);
    this.forest = new Forest();

    this.registerProviders();
  }

  get capabilities(): InitializeResult {
    return {
      capabilities: this.calculator.capabilities,
    };
  }

  private findElmWorkspace() {
    const elmFile = fs.readdirSync(this.workspaceFolders[0].name).find((value) => value === "elm.json");
    if (elmFile) {
      return URI.parse(elmFile);
    } else {
      this.connection.console.error("Cannot find elm.json in workspace.");
      return null;
    }
  }

  private registerProviders(): void {
    // tslint:disable:no-unused-expression
    new ASTProvider(this.connection, this.forest);
    new FoldingRangeProvider(this.connection, this.forest);
    new CompletionProvider(this.connection, this.forest);
    new DiagnosticsProvider(this.connection, this.elmWorkspaceFolder);
  }
}
