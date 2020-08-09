#!/usr/bin/env node

import * as Path from "path";
import "reflect-metadata";
import { container } from "tsyringe"; //must be after reflect-metadata
import {
  createConnection,
  IConnection,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
} from "vscode-languageserver";
import Parser from "web-tree-sitter";
import { CapabilityCalculator } from "./capabilityCalculator";
import { Forest } from "./forest";
import { ILanguageServer } from "./server";
import { DocumentEvents } from "./util/documentEvents";
import { Settings } from "./util/settings";
import { TextDocumentEvents } from "./util/textDocumentEvents";

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

// Composition root - be aware, there are some register calls that need to be done later
container.register<IConnection>("Connection", {
  useValue: createConnection(ProposedFeatures.all),
});
container.registerSingleton<Parser>("Parser", Parser);

container.registerSingleton("DocumentEvents", DocumentEvents);
container.registerSingleton("Forest", Forest);
container.register(TextDocumentEvents, {
  useValue: new TextDocumentEvents(),
});

const connection = container.resolve<IConnection>("Connection");

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
    container.resolve<Parser>("Parser").setLanguage(language);

    container.register(CapabilityCalculator, {
      useValue: new CapabilityCalculator(params.capabilities),
    });
    const initializationOptions = params.initializationOptions ?? {};

    container.register("Settings", {
      useValue: new Settings(initializationOptions, params.capabilities),
    });

    const { Server } = await import("./server");
    server = new Server(params);
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
