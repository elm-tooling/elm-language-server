#!/usr/bin/env node
import { ProposedFeatures, createConnection } from "vscode-languageserver/node";
import { startCommonServer } from "../common";
import { getCancellationStrategyFromArgv } from "./cancellation";
import { createNodeFileSystemHost } from "./fileSystem";

// Show version for `-v` or `--version` arguments
if (process.argv[2] === "-v" || process.argv[2] === "--version") {
  // require is used to avoid loading package if not necessary (~30ms time difference)
  process.stdout.write(`${require("pjson").version}\n`);
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

  startCommonServer(connection, createNodeFileSystemHost(connection));

  // Don't die on unhandled Promise rejections
  process.on("unhandledRejection", (reason, p) => {
    connection.console.error(
      `Unhandled Rejection at: Promise ${p} reason:, ${reason}`,
    );
  });
}
