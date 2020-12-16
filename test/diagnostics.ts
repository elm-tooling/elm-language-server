import "reflect-metadata";
import { container } from "tsyringe";
import { URI } from "vscode-uri";
import { Program } from "../src/compiler/program";
import * as path from "path";
import { Settings } from "../src/util/settings";
import Parser from "web-tree-sitter";
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { Diagnostic } from "../src/compiler/diagnostics";
import { performance } from "perf_hooks";
import { createProgramHost } from "./utils/sourceTreeParser";

container.register("Connection", {
  useValue: {
    console: {
      info: (): void => {
        // console.log(a);
      },
      warn: (): void => {
        // console.log(a);
      },
      error: (a: string): void => {
        console.log(a);
      },
    },
    window: {
      showErrorMessage: (a: string): void => {
        console.log(a);
      },
    },
  },
});

container.register("Settings", {
  useValue: new Settings({} as any, {}),
});

async function initParser(): Promise<void> {
  await Parser.init();
  const absolute = path.join(__dirname, "../tree-sitter-elm.wasm");
  const pathToWasm = path.relative(process.cwd(), absolute);

  const language = await Parser.Language.load(pathToWasm);
  container.registerSingleton("Parser", Parser);
  container.resolve<Parser>("Parser").setLanguage(language);
}

const failed: string[] = [];
const diagnosticTimes = new Map<string, number>();
const parsingErrors = new Set();

export async function runDiagnosticTests(uri: string): Promise<void> {
  const pathUri = URI.file(uri);

  try {
    let program = new Program(pathUri, createProgramHost());
    await program.init(() => {
      //
    });

    const start = performance.now();
    let diagnostics: Diagnostic[] = [];
    for (const sourceFile of program.getForest().treeMap.values()) {
      if (!sourceFile.writeable) {
        continue;
      }

      if (sourceFile.tree.rootNode.hasError()) {
        parsingErrors.add(sourceFile.maintainerAndPackageName);
        diagnostics = [];
        break;
      }

      diagnostics.push(
        ...[
          ...program.getSyntacticDiagnostics(sourceFile),
          ...program.getSemanticDiagnostics(sourceFile),
        ].filter((d) => !d.uri.includes("test")),
      );
    }

    diagnosticTimes.set(path.basename(uri), performance.now() - start);

    console.log(`${diagnostics.length} diagnostics found.`);

    diagnostics.forEach((diagnostic) => {
      console.log(`${path.basename(diagnostic.uri)}: ${diagnostic.message}`);
    });

    console.log();

    if (diagnostics.length === 0) {
      // appendFileSync(path.join(__dirname, "complete.txt"), `${uri}\n`);
    } else {
      failed.push(path.basename(uri));
      // process.exitCode = 1;
    }

    program.getForest().treeMap.forEach((sourceFile) => {
      sourceFile.tree.delete();
    });
    program = undefined!;
  } catch (e) {
    console.log(e);
    failed.push(path.basename(uri));
    // process.exitCode = 1;
  }
}

function checkout(repo: string, url: string): void {
  spawnSync("git", ["clone", `https://github.com/${url}`, repo]);

  const cur = process.cwd();
  const cwd = path.join(cur, repo);
  process.chdir(repo);
  spawnSync("git", ["fetch"]);
  spawnSync("git", ["reset", "--hard", "HEAD"]);

  const version = readElmJson();

  if (version === "0.19.1") {
    console.log("Make elm 0.19.1");
    spawnSync("elm0191", ["make"], { cwd });
  } else if (version === "0.19.0") {
    console.log("Make elm 0.19.0");
    spawnSync("elm0190", ["make"], { cwd });
  } else {
    console.log("Make elm 0.19.1 - Fallback");
    spawnSync("elm0191", ["make"], { cwd });
  }

  process.chdir(cur);
}

function readElmJson(): string {
  let version = "";
  const data = readFileSync("elm.json", "utf8");
  const match = /"elm-version": "(\d+.\d+.\d+)",/g.exec(data);
  if (match) {
    version = match[1];
  }

  return version;
}

console.log("Getting libs");

const libsToParse = require("../script/search.json") as {
  name: string;
  summary: string;
  license: string;
  version: string;
}[];

const parsingFailures = [
  "niho/json-schema-form",
  "brian-watkins/elm-spec",
  "ggb/elm-trend",
  "indicatrix/elm-chartjs-webcomponent", // comment between case branches
  "blissfully/elm-chartjs-webcomponent",
  "terezka/charts", // Let expr on the same line
  "zwilias/json-decode-exploration", // Weird parsing error in mgold/elm-nonempty-list
];
const compilerFailures = ["mdgriffith/elm-ui", "frandibar/elm-bootstrap"];

const otherFailures = [
  "Chadtech/elm-vector", // Too big
  "MattCheely/tryframe-coordinator", // Still on version 0.18
  "danmarcab/material-icons", // Still on version 0.18
  "krisajenkins/elm-astar", // Still on version 0.18
  "proda-ai/elm-svg-loader", // Still on version 0.18
  "sh4r3m4n/elm-piano", // Still on version 0.18
  "thaterikperson/elm-strftime", // Still on version 0.18
  "tomjkidd/elm-multiway-tree-zipper", // Still on version 0.18
];

const removedFromGithubFailures = [
  "HAN-ASD-DT/priority-queue",
  "HAN-ASD-DT/rsa",
  "abradley2/form-controls",
  "abradley2/form-fields",
  "altjsus/elm-airtable",
  "jwheeler-cp/elm-form",
  "m-mullins/elm-console",
  "nathanjohnson320/elm-ui-components",
  "nik-garmash/elm-test",
  "not1602/elm-feather",
  "ozyinc/elm-sortable-table-with-row-id",
  "peterszerzo/elm-natural-ui",
  "proda-ai/elm-logger",
];

let completed: string[] = [];

try {
  completed = readFileSync(path.join(__dirname, "complete.txt"))
    .toString()
    .split("\n");
} catch (e) {
  //
}

const filteredLibs = libsToParse
  .map((lib) => lib.name)
  .filter(
    (lib) =>
      !lib.startsWith("elm/") &&
      !lib.startsWith("elm-explorations/") &&
      !otherFailures.includes(lib) &&
      // !parsingFailures.includes(lib) &&
      !compilerFailures.includes(lib) &&
      !removedFromGithubFailures.includes(lib) &&
      !completed.includes(path.join(__dirname, "../", `examples-full/${lib}`)),
  );

console.log("Getting applications");

const applications = require("../script/applications.json") as string[];

async function testAll(): Promise<void> {
  await initParser();

  for (const lib of [...applications, ...filteredLibs]) {
    console.log(lib);
    const dir = `examples-full/${lib}`;

    try {
      checkout(dir, lib);

      await runDiagnosticTests(path.join(__dirname, "../", dir));
    } catch (e) {
      console.log(e);
    } finally {
      if (global.gc) {
        global.gc();
      }
    }
  }

  console.log("FAILURES");
  failed.forEach((fail) => console.log(fail));

  console.log("TOP TEN TIMES");
  Array.from(diagnosticTimes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([uri, time]) => {
      console.log(`${uri}: ${time.toFixed(0)}ms`);
    });

  console.log(
    `Had to skip ${parsingErrors.size} libraries due to parsing errors`,
  );
}

process.on("uncaughtException", function (err) {
  console.log(`Caught exception: ${err}`);
});

void testAll();
