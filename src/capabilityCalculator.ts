import {
  ClientCapabilities,
  ServerCapabilities,
  TextDocumentSyncKind,
} from "vscode-languageserver";
import * as ElmMakeDiagnostics from "./providers/diagnostics/elmMakeDiagnostics";

export class CapabilityCalculator {
  private clientCapabilities: ClientCapabilities;

  constructor(clientCapabilities: ClientCapabilities) {
    this.clientCapabilities = clientCapabilities;
  }

  get capabilities(): ServerCapabilities {
    this.clientCapabilities;

    return {
      codeActionProvider: {
        resolveProvider: true,
      },
      codeLensProvider: {
        resolveProvider: true,
      },
      completionProvider: {
        triggerCharacters: ["."],
      },
      definitionProvider: true,
      documentFormattingProvider: true,
      documentSymbolProvider: { label: "Elm" },
      executeCommandProvider: {
        commands: [ElmMakeDiagnostics.CODE_ACTION_ELM_MAKE],
      },
      foldingRangeProvider: true,
      hoverProvider: true,
      referencesProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      selectionRangeProvider: true,
      textDocumentSync: TextDocumentSyncKind.Incremental,
      workspaceSymbolProvider: true,
    };
  }
}
