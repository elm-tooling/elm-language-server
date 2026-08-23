import {
  ClientCapabilities,
  CodeActionKind,
  ServerCapabilities,
  TextDocumentSyncKind,
} from "vscode-languageserver";
import { CommandManager } from "./commandManager.js";
import * as ElmMakeDiagnostics from "./providers/diagnostics/elmMakeDiagnostics.js";

export class CapabilityCalculator {
  private clientCapabilities: ClientCapabilities;

  constructor(clientCapabilities: ClientCapabilities) {
    this.clientCapabilities = clientCapabilities;
  }

  get capabilities(): ServerCapabilities {
    return {
      codeActionProvider: {
        codeActionKinds: [
          CodeActionKind.QuickFix,
          CodeActionKind.Refactor,
          CodeActionKind.RefactorExtract,
          CodeActionKind.RefactorMove,
        ],
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
        commands: [
          ElmMakeDiagnostics.CODE_ACTION_ELM_MAKE,
          ...CommandManager.commands,
        ],
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
      workspace: {
        ...(this.clientCapabilities.workspace?.textDocumentContent
          ? {
              textDocumentContent: {
                schemes: ["elm-virtual-file"],
              },
            }
          : {}),
        fileOperations: {
          didCreate: {
            filters: [
              {
                scheme: "file",
                pattern: { glob: "**/*.elm", matches: "file" },
              },
            ],
          },
          willRename: {
            filters: [
              {
                scheme: "file",
                pattern: { glob: "**/*.elm", matches: "file" },
              },
              {
                scheme: "file",
                pattern: { glob: "**/", matches: "folder" },
              },
            ],
          },
          willDelete: {
            filters: [
              {
                scheme: "file",
                pattern: { glob: "**/*.elm", matches: "file" },
              },
            ],
          },
        },
      },
      linkedEditingRangeProvider: true,
    };
  }
}
