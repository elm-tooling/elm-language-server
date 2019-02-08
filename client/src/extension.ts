"use strict";

import * as path from "path";
import { ExtensionContext, workspace } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient";

let languageClient: LanguageClient;

export async function activate(context: ExtensionContext) {
    // We get activated if there is one or more elm.json file in the workspace
    // Start one server for each directory with an elm.json
    // and watch Elm files in those directories.
    // TODO we can't have multiple instances
    const elmJsons = await workspace.findFiles("**/elm.json");
    const elmJson = elmJsons.find((a) => !(a.fsPath.includes("node_modules") || a.fsPath.includes("elm-stuff")));
    if (elmJson) {
        startClient(path.dirname(elmJson.fsPath), context);
    }
    // TODO: watch for addition and removal of 'elm.json' files
    // and start and stop clients for those directories.
}

const clients: Map<string, LanguageClient> = new Map();
function startClient(dir: string, context: ExtensionContext) {
    if (clients.has(dir)) {
        // Client was already started for this directory
        return;
    }

    const serverModule = context.asAbsolutePath(
        path.join("server", "out", "index.js"),
    );
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        debug: {
            module: serverModule,
            options: debugOptions,
            transport: TransportKind.ipc,
        },
        run: { module: serverModule, transport: TransportKind.ipc },
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for Elm documents in the directory
        documentSelector: [
            {
                pattern: path.join(dir, "**", "*.elm"),
                scheme: "file",
            },
        ],
        // Notify the server about file changes to 'elm.json'
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher(path.join(dir, "elm.json")),
        },
    };

    // Create the language client and start the client.
    languageClient = new LanguageClient(
        "elmLanguageServer",
        "Elm Language Server",
        serverOptions,
        clientOptions,
    );

    // Start the client. This will also launch the server
    languageClient.start();
    languageClient.info(`Starting language server for ${dir}`);
    clients.set(dir, languageClient);
}

export function deactivate(): Thenable<void> {
    const promises: Array<Thenable<void>> = [];
    for (const client of clients.values()) {
        promises.push(client.stop());
    }
    return Promise.all(promises).then(() => undefined);
}
