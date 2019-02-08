import { createConnection, IConnection, InitializeParams,
  InitializeResult, ProposedFeatures, WorkspaceFolder } from "vscode-languageserver";
import { ILanguageServer } from "./server";
import { rebuildTreeSitter } from "./util/rebuilder";

const connection: IConnection = createConnection(ProposedFeatures.all);
let workspaceFolder: WorkspaceFolder;

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  return new Promise<InitializeResult>(async (resolve, reject) => {
    try {
      if (params.workspaceFolders && params.workspaceFolders.length > 0) {

        workspaceFolder = params.workspaceFolders[0];
        connection.console.info(`Initializing Elm language server for ${workspaceFolder.uri}...`);

        connection.console.info("Rebuilding tree-sitter for local Electron version");
        const rebuildResult: [void | Error, void | Error] = await rebuildTreeSitter();
        for (const result of rebuildResult) {
          if (result) {
            connection.console.error("Rebuild failed!");
            connection.console.error(result.toString());
            reject();
          }
        }
        connection.console.info("Rebuild succeeded!");

        const { Server } = await import("./server");
        const server: ILanguageServer = new Server(
          connection,
          workspaceFolder,
          params,
        );

        resolve(server.capabilities);
      } else {
        throw new Error("No workspace set");
      }
    } catch (error) {
      reject();
    }
  },
  );
});

// Listen on the connection
connection.listen();
