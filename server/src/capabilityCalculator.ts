import {
    ClientCapabilities,
    ServerCapabilities,
    TextDocumentSyncKind,
} from "vscode-languageserver";

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
            completionProvider: {
                triggerCharacters: ["."],
            },
            documentFormattingProvider: true,
            foldingRangeProvider: true,
            textDocumentSync: TextDocumentSyncKind.Full,
        };
    }
}
