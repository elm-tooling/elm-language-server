import {
  ClientCapabilities,
  ServerCapabilities,
  TextDocumentSyncKind,
} from "vscode-languageserver";
import * as ElmAnalyseDiagnostics from "./providers/diagnostics/elmAnalyseDiagnostics";

export class CapabilityCalculator {
  private clientCapabilities: ClientCapabilities;

  constructor(clientCapabilities: ClientCapabilities) {
    this.clientCapabilities = clientCapabilities;
  }

  get capabilities(): ServerCapabilities {
    // tslint:disable-next-line:no-unused-expression
    this.clientCapabilities;

    return {
      // Perform incremental syncs
      // Incremental sync is disabled for now due to not being able to get the
      // old text in ASTProvider
      // textDocumentSync: TextDocumentSyncKind.Incremental,
      codeActionProvider: true,
      codeLensProvider: {
        resolveProvider: true,
      },
      completionProvider: {},
      definitionProvider: true,
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      documentSymbolProvider: true,
      executeCommandProvider: {
        commands: [
          ElmAnalyseDiagnostics.CODE_ACTION_ELM_ANALYSE,
          ElmAnalyseDiagnostics.CODE_ACTION_ELM_ANALYSE_FIX_ALL,
        ],
      },
      foldingRangeProvider: true,
      hoverProvider: true,
      referencesProvider: true,
      renameProvider: true,
      textDocumentSync: TextDocumentSyncKind.Full,
      workspaceSymbolProvider: true,
    };
  }
}
