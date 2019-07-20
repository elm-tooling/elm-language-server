#!/usr/bin/env node

import * as Path from "path";
import {
  createConnection,
  DidChangeConfigurationParams,
  IConnection,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
} from "vscode-languageserver";
import Parser from "web-tree-sitter";
import { ILanguageServer } from "./server";

export type Runtime = "node" | "electron";
const connection: IConnection = createConnection(ProposedFeatures.all);

connection.onDidChangeConfiguration((params: DidChangeConfigurationParams) => {
  return undefined;
});

connection.onInitialize(
  async (params: InitializeParams): Promise<InitializeResult> => {
    return new Promise<InitializeResult>(async (resolve, reject) => {
      try {
        connection.console.info("Activating tree-sitter...");
        await Parser.init();
        const absolute = Path.join(__dirname, "tree-sitter-elm.wasm");
        const pathToWasm = Path.relative(process.cwd(), absolute);
        const language = await Parser.Language.load(pathToWasm);
        const parser = new Parser();
        parser.setLanguage(language);

        const { Server } = await import("./server");
        const server: ILanguageServer = new Server(connection, params, parser);

        resolve(server.capabilities);
      } catch (error) {
        connection.console.info(error.message);
        reject();
      }
    });
  },
);

// Listen on the connection
connection.listen();
