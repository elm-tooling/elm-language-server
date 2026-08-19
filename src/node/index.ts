#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProposedFeatures, createConnection } from "vscode-languageserver/node";
import { startCommonServer } from "../common/index.js";
import { getCancellationStrategyFromArgv } from "./cancellation.js";
import { createNodeFileSystemHost } from "./fileSystem.js";

const outDir =
  typeof __dirname === "string"
    ? __dirname
    : fileURLToPath(new URL("..", import.meta.url));

// Show version for `-v` or `--version` arguments
if (process.argv[2] === "-v" || process.argv[2] === "--version") {
  const packageJson = JSON.parse(
    readFileSync(path.join(outDir, "../package.json"), "utf8"),
  ) as { version: string };
  process.stdout.write(`${packageJson.version}\n`);
  process.exit(0);
}

startLanguageServer();

export function startLanguageServer(): void {
  // default argument `--stdio`
  if (process.argv.length === 2) {
    process.argv.push("--stdio");
  }

  const connection = createConnection(ProposedFeatures.all, {
    cancellationStrategy: getCancellationStrategyFromArgv(process.argv),
  });

  startCommonServer(
    connection,
    createNodeFileSystemHost(connection),
    path.join(outDir, "tree-sitter-elm.wasm"),
  );

  // Don't die on unhandled Promise rejections
  process.on("unhandledRejection", (reason, p) => {
    connection.console.error(
      `Unhandled Rejection at: Promise ${p} reason:, ${reason}`,
    );
  });
}
