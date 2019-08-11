#!/usr/bin/env node

import * as Path from "path";
import {
  createConnection,
  IConnection,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
} from "vscode-languageserver";
import Parser from "web-tree-sitter";
import { ILanguageServer } from "./server";

const connection: IConnection = createConnection(ProposedFeatures.all);
let server: ILanguageServer;

connection.onInitialize(
  async (params: InitializeParams): Promise<InitializeResult> => {
    await Parser.init();
    const absolute = Path.join(__dirname, "tree-sitter-elm.wasm");
    const pathToWasm = Path.relative(process.cwd(), absolute);
    connection.console.info(
      `Loading Elm tree-sitter syntax from ${pathToWasm}`,
    );
    const language = await Parser.Language.load(pathToWasm);
    const parser = new Parser();
    parser.setLanguage(language);

    const { Server } = await import("./server");
    server = new Server(connection, params, parser);
    await server.init();

    return server.capabilities;
  },
);

connection.onInitialized(async () => {
  server.registerInitializedProviders();
});

// Listen on the connection
connection.listen();

// Don't die on unhandled Promise rejections
process.on("unhandledRejection", (reason, p) => {
  connection.console.error(
    `Unhandled Rejection at: Promise ${p} reason:, ${reason}`,
  );
});
