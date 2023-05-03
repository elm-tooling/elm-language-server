import "reflect-metadata";
import { container } from "tsyringe";
import { URI } from "vscode-uri";
import { Program } from "../src/compiler/program";
import { importsTime, resetImportsTime } from "../src/compiler/imports";
import {
  definitionTime,
  mappingTime,
  resetDefinitionAndMappingTime,
} from "../src/compiler/utils/expressionTree";
import { bindTime, resetBindTime } from "../src/compiler/typeChecker";
import { inferTime, resetInferTime } from "../src/compiler/typeInference";
import * as path from "path";
import { argv } from "process";
import { Settings } from "../src/util/settings";
import Parser from "web-tree-sitter";
import { replaceTime, resetReplaceTime } from "../src/compiler/typeReplacement";
import {
  getCancellationFilePath,
  FileBasedCancellationTokenSource,
  getCancellationFolderPath,
  ThrottledCancellationToken,
} from "../src/cancellation";
import { randomBytes } from "crypto";
import { createProgramHost } from "./utils/sourceTreeParser";
import { PerformanceTimer } from "../src/compiler/typeExpression";

container.register("Connection", {
  useValue: {
    console: {
      info: (a: string): void => {
        // console.log(a);
      },
      warn: (a: string): void => {
        // console.log(a);
      },
      error: (a: string): void => {
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

export async function runPerformanceTests(uri: string): Promise<void> {
  const pathUri = URI.file(uri);
  console.log(`Running with uri: ${pathUri.fsPath}`);

  await initParser();

  const times: { [name: string]: number } = {};
  function addTime(name: string, time: number): void {
    times[name] = (times[name] ?? 0) + time;
  }

  // function addPerfTime(name: string, time: PerformanceTimer): void {
  //   times[name] = (times[name] ?? 0) + time.total;
  //   time.reset();
  // }

  const numTimes = 10;

  for (let i = 0; i < numTimes; i++) {
    const program = new Program(pathUri, createProgramHost());
    await program.init(() => {
      //
    });

    const cancellationToken = new FileBasedCancellationTokenSource(
      getCancellationFilePath(
        getCancellationFolderPath(randomBytes(21).toString("hex")),
        "1",
      ),
    );

    const token = new ThrottledCancellationToken(cancellationToken.token);

    program
      .getForest()
      .treeMap.forEach((sourceFile) =>
        program.getTypeChecker().getDiagnostics(sourceFile, token),
      );

    addTime("BINDING   :", bindTime);
    addTime("INFER     :", inferTime);
    addTime("IMPORTS   :", importsTime);
    addTime("MAPPING   :", mappingTime);
    addTime("DEFINITION:", definitionTime);
    addTime("REPLACE   :", replaceTime);

    resetBindTime();
    resetInferTime();
    resetImportsTime();
    resetDefinitionAndMappingTime();
    resetReplaceTime();

    process.stdout.write(`Finished run ${i + 1}/${numTimes}\n`);
  }

  console.log("\n");
  Object.entries(times).forEach(([name, time]) => {
    const averageTime = time / numTimes;
    console.log(`${name} ${averageTime.toFixed(1)}ms`);
  });
}

/**
 * Run performance tests by passing in a path to the workspace
 * Example: `yarn ts-node ./test/performance.ts ../../my-elm-workspace/`
 */

const inputPath = argv[argv.length - 1];
void runPerformanceTests(
  path.isAbsolute(inputPath)
    ? inputPath
    : path.join(__dirname, "../", inputPath),
);
