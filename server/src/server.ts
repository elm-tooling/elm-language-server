import { Connection, InitializeParams, InitializeResult } from "vscode-languageserver";

import { CapabilityCalculator } from "./capabilityCalculator";
import { Forest } from "./forest";
import { ASTProvider } from "./providers/astProvider";
import { CompletionProvider } from "./providers/completionProvider";
import { FoldingRangeProvider } from "./providers/foldingProvider";

export interface ILanguageServer {
    readonly capabilities: InitializeResult;
}

export class Server implements ILanguageServer {
    public connection: Connection;
    private calculator: CapabilityCalculator;
    private forest: Forest;

    constructor(connection: Connection, params: InitializeParams) {
        this.connection = connection;
        this.calculator = new CapabilityCalculator(params.capabilities);
        this.forest = new Forest();

        this.registerProviders();
    }

    get capabilities(): InitializeResult {
        return {
            capabilities: this.calculator.capabilities,
        };
    }

    private registerProviders(): void {
        // tslint:disable:no-unused-expression
        new ASTProvider(this.connection, this.forest);
        new FoldingRangeProvider(this.connection, this.forest);
        new CompletionProvider(this.connection, this.forest);
    }
}
