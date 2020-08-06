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
import "reflect-metadata";

import { container } from "tsyringe"; //must be after reflect-metadata

// Show version for `-v` or `--version` arguments
if (process.argv[2] === "-v" || process.argv[2] === "--version") {
  // require is used to avoid loading package if not necessary (~30ms time difference)
  process.stdout.write(`${require("pjson").version}\n`);
  process.exit(0);
}

// default argument `--stdio`
if (process.argv.length === 2) {
  process.argv.push("--stdio");
}

container.register<IConnection>("Connection", {
  useValue: createConnection(ProposedFeatures.all),
});
const connection = container.resolve<IConnection>("Connection");

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
    container.registerSingleton<Parser>("Parser", Parser);
    container.resolve<Parser>("Parser").setLanguage(language);

    const { Server } = await import("./server");
    server = new Server(params, progress);
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
