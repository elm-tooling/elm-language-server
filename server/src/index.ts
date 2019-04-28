import {
  createConnection,
  IConnection,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
} from "vscode-languageserver";
import { ILanguageServer } from "./server";
import { rebuildTreeSitter } from "./util/rebuilder";

export type Runtime = "node" | "electron";
const connection: IConnection = createConnection(ProposedFeatures.all);

connection.onInitialize(
  async (params: InitializeParams): Promise<InitializeResult> => {
    return new Promise<InitializeResult>(async (resolve, reject) => {
      try {
        connection.console.info(
          "Rebuilding tree-sitter for local Electron version",
        );
        const runtime: Runtime =
          params.initializationOptions.runtime || "electron";
        const rebuildResult: [
          void | Error,
          void | Error
        ] = await rebuildTreeSitter(connection.console, runtime);
        for (const result of rebuildResult) {
          if (result) {
            connection.console.error("Rebuild failed!");
            connection.console.error(result.toString());
            reject();
          }
        }
        connection.console.info("Rebuild succeeded!");

        const { Server } = await import("./server");
        const server: ILanguageServer = new Server(connection, params);

        resolve(server.capabilities);
      } catch (error) {
        reject();
      }
    });
  },
);

// Listen on the connection
connection.listen();
