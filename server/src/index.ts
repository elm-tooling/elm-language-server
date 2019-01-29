import {
  createConnection,
  IConnection,
  InitializeParams,
  ProposedFeatures,
  WorkspaceFolder,
} from "vscode-languageserver";
import { ILanguageServer } from "./server";
import { rebuildTreeSitter } from "./util/rebuilder";

const connection: IConnection = createConnection(ProposedFeatures.all);
let workspaceFolder: WorkspaceFolder;

connection.onInitialize(async (params: InitializeParams) => {
  workspaceFolder = params.workspaceFolders[0];
  connection.console.info(`Initializing Elm language server for ${workspaceFolder}...`);

  connection.console.info("Rebuilding tree-sitter for local Electron version");
  const rebuildResult: [void | Error, void | Error] = await rebuildTreeSitter();
  for (const result of rebuildResult) {
    if (result) {
      connection.console.error("Rebuild failed!");
      connection.console.error(result.toString());

      return null;
    }
  }
  connection.console.info("Rebuild succeeded!");

  const { Server } = await import("./server");
  const server: ILanguageServer = new Server(
    connection,
    workspaceFolder,
    params,
  );

  return server.capabilities;
});

// Listen on the connection
connection.listen();
