import "reflect-metadata";
import { container } from "tsyringe";
import { URI } from "vscode-uri";
import { ElmWorkspace } from "../src/elmWorkspace";
import { importsTime, resetImportsTime } from "../src/imports";
import {
  definitionTime,
  mappingTime,
  mappingTimes,
  resetDefinitionAndMappingTime,
} from "../src/util/types/expressionTree";
import { bindTime, resetBindTime } from "../src/util/types/typeChecker";
import {
  inferTime,
  inferTimes,
  resetInferTime,
} from "../src/util/types/typeInference";
import * as path from "path";
import { argv } from "process";
import { Settings } from "../src/util/settings";
import Parser from "web-tree-sitter";

container.register("Connection", {
  useValue: {
    console: {
      info: (): void => {
        //
      },
      warn: (): void => {
        //
      },
      error: (): void => {
        //
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
  await initParser();

  const times: { [name: string]: number } = {};
  function addTime(name: string, time: number): void {
    times[name] = (times[name] ?? 0) + time;
  }

  const numTimes = 10;

  for (let i = 0; i < numTimes; i++) {
    const elmWorkspace = new ElmWorkspace(URI.file(uri));
    await elmWorkspace.init(() => {
      //
    });

    elmWorkspace
      .getForest()
      .treeMap.forEach(elmWorkspace.getTypeChecker().getDiagnostics);

    addTime("BINDING   :", bindTime);
    addTime("INFER     :", inferTime);
    addTime("IMPORTS   :", importsTime);
    addTime("MAPPING   :", mappingTime);
    addTime("DEFINITION:", definitionTime);

    resetBindTime();
    resetInferTime();
    resetImportsTime();
    resetDefinitionAndMappingTime();

    process.stdout.clearLine(-1);
    process.stdout.cursorTo(0);
    process.stdout.write(`Finished run ${i + 1}/${numTimes}\n`);
  }

  console.log("\n");
  Object.entries(times).forEach(([name, time]) => {
    const averageTime = time / numTimes;
    console.log(`${name} ${averageTime.toFixed(1)}ms`);
  });

  Object.entries(mappingTimes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([func, time]) => {
      console.log(`MAPPING: ${func} took ${time.toFixed(1)}ms`);
    });

  Object.entries(inferTimes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([func, time]) => {
      console.log(`INFER: ${func} took ${time.toFixed(1)}ms`);
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
