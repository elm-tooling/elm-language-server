import { Connection, InitializeParams, InitializeResult } from "vscode-languageserver";

import { CapabilityCalculator } from "./capabilityCalculator";
import { Forest } from "./forest";
import { ASTProvider } from "./providers/astProvider";

export interface ILanguageServer {
    readonly capabilities: InitializeResult;
}

export class Server implements ILanguageServer {
    public connection: Connection;
    private calculator: CapabilityCalculator;
    private forest: Forest;

    constructor(connection: Connection, params: InitializeParams) {
        this.connection = connection;
        this.forest = new Forest();

        this.registerProviders();
    }

    get capabilities(): InitializeResult {
        return {
            capabilities: this.calculator.capabilities,
        };
    }

    private registerProviders(): void {
        // tslint:disable-next-line:no-unused-expression
        new ASTProvider(this.connection, this.forest);
        // new DocumentHighlightProvider(this.connection, this.forest);
        // new FoldingRangeProvider(this.connection, this.forest);
    }
}
