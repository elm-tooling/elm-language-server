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

// Show version for `-v` or `--version` arguments
if (process.argv[2] === "-v" || process.argv[2] === "--version") {
  // require is used to avoid loading package if not necessary (~30ms time difference)
  // tslint:disable-next-line no-var-requires
  process.stdout.write(`${require("pjson").version}\n`);
  process.exit(0);
}

// default argument `--stdio`
if (process.argv.length === 2) {
  process.argv.push("--stdio");
}

const connection: IConnection = createConnection(ProposedFeatures.all);
let server: ILanguageServer;

connection.onInitialize(
  async (
    params: InitializeParams,
    cancel,
    progress,
  ): Promise<InitializeResult> => {
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
    server = new Server(connection, params, parser, progress);
    await server.init();

    return server.capabilities;
  },
);

connection.onInitialized(() => {
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
