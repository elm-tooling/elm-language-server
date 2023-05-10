#!/usr/bin/env node
import { startLanguageServer } from "./node";

// Show version for `-v` or `--version` arguments
if (process.argv[2] === "-v" || process.argv[2] === "--version") {
  // require is used to avoid loading package if not necessary (~30ms time difference)
  process.stdout.write(`${require("pjson").version}\n`);
  process.exit(0);
}

startLanguageServer();
