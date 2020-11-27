import "reflect-metadata";
import { container } from "tsyringe";
import { URI } from "vscode-uri";
import { ElmWorkspace } from "../src/elmWorkspace";
import * as path from "path";
import { Settings } from "../src/util/settings";
import Parser from "web-tree-sitter";
import {
  getCancellationFilePath,
  FileBasedCancellationTokenSource,
  getCancellationFolderPath,
  ThrottledCancellationToken,
} from "../src/cancellation";
import { randomBytes } from "crypto";
import { Diagnostic } from "vscode-languageserver";
import { spawnSync } from "child_process";
import { appendFileSync, readFileSync } from "fs";

container.register("Connection", {
  useValue: {
    console: {
      info: (): void => {
        // console.log(a);
      },
      warn: (): void => {
        // console.log(a);
      },
      error: (): void => {
        // console.log(a);
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

export async function runDiagnosticTests(uri: string): Promise<void> {
  const pathUri = URI.file(uri);

  await initParser();

  const elmWorkspace = new ElmWorkspace(pathUri);
  await elmWorkspace.init(() => {
    //
  });

  const cancellationToken = new FileBasedCancellationTokenSource(
    getCancellationFilePath(
      getCancellationFolderPath(randomBytes(21).toString("hex")),
      "1",
    ),
  );

  const token = new ThrottledCancellationToken(cancellationToken.token);

  try {
    const diagnostics: Diagnostic[] = [];
    elmWorkspace.getForest().treeMap.forEach((treeContainer) =>
      diagnostics.push(
        ...elmWorkspace
          .getTypeChecker()
          .getDiagnostics(treeContainer, token)
          .filter((d) => {
            const uri = (<any>d.data).uri as string;
            return (
              !uri.includes("test") &&
              elmWorkspace.getForest().getByUri(uri)?.writeable
            );
          }),
      ),
    );
    console.log("\n");
    console.log(uri);
    console.log(`${diagnostics.length} diagnostics found.`);

    diagnostics.forEach((diagnostic) => {
      console.log(
        `${path.basename((<any>diagnostic.data).uri)}: ${diagnostic.message}`,
      );
    });

    if (diagnostics.length === 0) {
      appendFileSync(path.join(__dirname, "complete.txt"), `${uri}\n`);
    } else {
      process.exitCode = 1;
    }
  } catch (e) {
    console.log("\n");
    console.log(uri);
    console.log(e);
    process.exitCode = 1;
  }
}

function checkout(repo: string, url: string): void {
  spawnSync("git", ["clone", `https://github.com/${url}`, repo]);

  const cur = process.cwd();
  process.chdir(repo);
  spawnSync("git", ["fetch"]);
  spawnSync("git", ["reset", "--hard", "HEAD"]);
  spawnSync("elm", ["make"]);
  spawnSync("elm-test");
  process.chdir(cur);
}

console.log("Getting libs");

const libsToParse = require("../script/search.json") as {
  name: string;
  summary: string;
  license: string;
  version: string;
}[];

const parsingFailures = [
  "showell/dict-dot-dot",
  "folkertdev/elm-cff",
  "niho/json-schema-form",
  "ianmackenzie/elm-iso-10303",
  "ianmackenzie/elm-step-file",
  "brian-watkins/elm-spec",
  "ggb/elm-trend",
  "indicatrix/elm-chartjs-webcomponent", // comment between case branches
  "blissfully/elm-chartjs-webcomponent",
  "terezka/charts", // Let expr on the same line
  "zwilias/json-decode-exploration", // Weird parsing error in mgold/elm-nonempty-list
];
const compilerFailures = ["pablohirafuji/elm-qrcode", "rtfeldman/elm-css"];

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
      !parsingFailures.includes(lib) &&
      !compilerFailures.includes(lib) &&
      !completed.includes(path.join(__dirname, "../", `examples-full/${lib}`)),
  );

console.log("Getting applications");

const applications = require("../script/applications.json") as string[];

[...applications, ...filteredLibs]
  // .slice(0, 50)
  .forEach((lib) => {
    console.log(lib);
    const dir = `examples-full/${lib}`;

    try {
      checkout(dir, lib);

      void runDiagnosticTests(path.join(__dirname, "../", dir));
    } catch (e) {
      console.log(e);
    }
  });
