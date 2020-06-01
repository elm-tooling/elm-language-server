import {
  ClientCapabilities,
  ServerCapabilities,
  TextDocumentSyncKind,
} from "vscode-languageserver";
import * as ElmAnalyseDiagnostics from "./providers/diagnostics/elmAnalyseDiagnostics";
import * as ElmMakeDiagnostics from "./providers/diagnostics/elmMakeDiagnostics";

export class CapabilityCalculator {
  private clientCapabilities: ClientCapabilities;

  constructor(clientCapabilities: ClientCapabilities) {
    this.clientCapabilities = clientCapabilities;
  }

  get capabilities(): ServerCapabilities {
    this.clientCapabilities;

    return {
      codeActionProvider: true,
      codeLensProvider: {
        resolveProvider: true,
      },
      completionProvider: {
        triggerCharacters: ["."],
      },
      definitionProvider: true,
      documentFormattingProvider: true,
      documentSymbolProvider: true,
      executeCommandProvider: {
        commands: [
          ElmAnalyseDiagnostics.CODE_ACTION_ELM_ANALYSE,
          ElmAnalyseDiagnostics.CODE_ACTION_ELM_ANALYSE_FIX_ALL,
          ElmMakeDiagnostics.CODE_ACTION_ELM_MAKE,
        ],
      },
      foldingRangeProvider: true,
      hoverProvider: true,
      referencesProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      selectionRangeProvider: true,
      textDocumentSync: TextDocumentSyncKind.Full,
      workspaceSymbolProvider: true,
    };
  }
}
