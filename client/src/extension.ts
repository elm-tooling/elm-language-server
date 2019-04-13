"use strict";

import * as path from "path";
import {
  ExtensionContext,
  RelativePattern,
  Uri,
  workspace,
  OutputChannel,
  window as Window,
} from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient";

let languageClient: LanguageClient;

export async function activate(context: ExtensionContext) {
  // We get activated if there is one or more elm.json file in the workspace
  // Start one server for each workspace with at least one elm.json
  // and watch Elm files in those directories.

  const elmJsons = await workspace.findFiles(
    "**/elm.json",
    "**/@(node_modules|elm-stuff)/**",
  );
  elmJsons.forEach(uri => {
    const workspaceFolder = workspace.getWorkspaceFolder(uri);
    const elmJsonFolder = getElmJsonFolder(uri);
    if (workspaceFolder) {
      startClient(workspaceFolder.uri.fsPath, context, elmJsonFolder);
    }
  });

  const watcher = workspace.createFileSystemWatcher(
    "**/elm.json",
    false,
    true,
    false,
  );
  watcher.onDidCreate(uri => {
    const workspaceFolder = workspace.getWorkspaceFolder(uri);
    const elmJsonFolder = getElmJsonFolder(uri);
    if (workspaceFolder) {
      startClient(workspaceFolder.uri.fsPath, context, elmJsonFolder);
    }
  });
  watcher.onDidDelete(uri => {
    const workspaceFolder = workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      stopClient(workspaceFolder.uri);
    }
  });
}

function getElmJsonFolder(uri: Uri): Uri {
  return Uri.parse(uri.fsPath.replace("elm.json", ""));
}

async function stopClient(workspaceUri: Uri) {
  const client = clients.get(workspaceUri.fsPath);

  if (client) {
    const pattern = new RelativePattern(workspaceUri.fsPath, "**/elm.json");
    const files = await workspace.findFiles(
      pattern,
      "**/@(node_modules|elm-stuff)/**",
    );
    if (files.length === 0) {
      languageClient.info("Found the client shutting it down.");
      client.stop();
      clients.delete(workspaceUri.fsPath);
    } else {
      languageClient.info(
        "There are still elm.json files in this workspace, not stopping the client.",
      );
    }
  } else {
    languageClient.info("Could not find the client that we want to shutdown.");
  }
}

const clients: Map<string, LanguageClient> = new Map();
function startClient(
  clientWorkspace: string,
  context: ExtensionContext,
  elmWorkspace: Uri,
) {
  if (clients.has(clientWorkspace)) {
    // Client was already started for this directory
    return;
  }

  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "index.js"),
  );
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  let debugOptions = {
    execArgv: ["--nolazy", `--inspect=${6010 + clients.size}`],
  };

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
  let outputChannel: OutputChannel = Window.createOutputChannel("elm-lsp");

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for Elm documents in the directory
    documentSelector: [
      {
        pattern: path.join(clientWorkspace, "**", "*.elm"),
        scheme: "file",
      },
    ],
    initializationOptions: { elmWorkspace: elmWorkspace.toString() },
    // Notify the server about file changes to 'elm.json'
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher(
        path.join(clientWorkspace, "**/elm.json"),
      ),
    },
    diagnosticCollectionName: "elm-lsp",
    outputChannel: outputChannel,
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
  languageClient.info(`Starting language server for ${clientWorkspace}`);
  clients.set(clientWorkspace, languageClient);
}

export function deactivate(): Thenable<void> | undefined {
  const promises: Array<Thenable<void>> = [];
  for (const client of clients.values()) {
    promises.push(client.stop());
  }
  return Promise.all(promises).then(() => undefined);
}
