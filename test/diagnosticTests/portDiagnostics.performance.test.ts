import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { performance } from "node:perf_hooks";
import { mockDeep } from "jest-mock-extended";
import { container } from "tsyringe";
import { Connection, Disposable, Emitter } from "vscode-languageserver";
import { Utils as UriUtils } from "vscode-uri";
import { Parser } from "web-tree-sitter";
import { ASTProvider } from "../../src/common/providers/astProvider.js";
import { DiagnosticsProvider } from "../../src/common/providers/diagnostics/diagnosticsProvider.js";
import { ElmLsDiagnostics } from "../../src/common/providers/diagnostics/elmLsDiagnostics.js";
import { IElmAnalyseJsonService } from "../../src/common/providers/diagnostics/elmAnalyseJsonService.js";
import { TextDocumentEvents } from "../../src/common/util/textDocumentEvents.js";
import { TreeUtils } from "../../src/common/util/treeUtils.js";
import { ISourceFile } from "../../src/compiler/forest.js";
import { IProgram } from "../../src/compiler/program.js";
import { SourceTreeParser, srcUri } from "../utils/sourceTreeParser.js";

// These are real elapsed-time limits, even while the scheduler uses fake timers.
// Work-count assertions below additionally catch scans on fast machines.
const PORT_MODULE_BATCH_BUDGET_MS = 200;
const REFRESH_CYCLE_BUDGET_MS = 3000;
const UNRELATED_MODULES = 120;
const PORT_MODULES = 24;
const LARGE_MODULE_DECLARATIONS = 10000;
const BATCH_ITERATIONS = 30;

const parser = new SourceTreeParser();
let diagnostics: DiagnosticsProvider | undefined;
let changes: Emitter<{
  sourceFile: ISourceFile;
  previousDependencies: readonly string[];
}>;
let deletions: Emitter<{
  uri: string;
  previousDependencies: readonly string[];
}>;

const uri = (name: string): string =>
  UriUtils.joinPath(srcUri, `${name}.elm`).toString();

beforeAll(async () => {
  await parser.init();
});

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["performance", "hrtime"] });
  changes = new Emitter();
  deletions = new Emitter();
  container.register(ASTProvider, {
    useValue: mockDeep<ASTProvider>({
      onTreeChange: changes.event,
      onTreeDelete: deletions.event,
    }),
  });
  container.register(TextDocumentEvents, {
    useValue: mockDeep<TextDocumentEvents>({
      getOpenUris: () => [],
      onDidOpen: () => Disposable.create(() => {}),
      onDidSave: () => Disposable.create(() => {}),
      onDidChange: () => Disposable.create(() => {}),
    }),
  });
  jest
    .spyOn(
      container.resolve<Connection>("Connection"),
      "onDidChangeConfiguration",
    )
    .mockReturnValue(Disposable.create(() => {}));

  // Isolate the two port checks from unrelated lint-query costs. Parsing,
  // binding, type/reference resolution and diagnostic scheduling remain real.
  jest
    .spyOn(
      container.resolve<IElmAnalyseJsonService>("ElmAnalyseJsonService"),
      "getElmAnalyseJson",
    )
    .mockReturnValue({
      checks: {
        UnusedImport: false,
        UnusedImportedVariable: false,
        UnusedImportAlias: false,
        UnusedPatternVariable: false,
        MapNothingToNothing: false,
        BooleanCase: false,
        DropConcatOfLists: false,
        DropConsOfItemAndList: false,
        UseConsOverConcat: false,
        SingleFieldRecord: false,
        UnnecessaryListConcat: false,
        NoUncurriedPrefix: false,
        UnusedTypeAlias: false,
        UnusedValueConstructor: false,
        MissingTypeAnnotation: false,
        UnnecessaryPortModule: true,
        UnusedIncomingPort: true,
      },
    });
});

afterEach(() => {
  diagnostics?.dispose();
  diagnostics = undefined;
  changes.dispose();
  deletions.dispose();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function createDiagnostics(
  program: IProgram,
  automatic = false,
): DiagnosticsProvider {
  container.register("ElmWorkspaces", { useValue: [program] });
  container.register("ClientSettings", {
    useValue: { onlyUpdateDiagnosticsOnSave: !automatic },
  });
  container.register(ElmLsDiagnostics, { useValue: new ElmLsDiagnostics() });
  diagnostics = new DiagnosticsProvider();
  return diagnostics;
}

it("keeps repeated port-module checks independent of large module bodies", async () => {
  const body = Array.from(
    { length: LARGE_MODULE_DECLARATIONS },
    (_, i) => `value${i} x = ( x, [ x, x, x ] )`,
  ).join("\n");
  const program = await parser.getProgram({
    "Empty.elm": `port module Empty exposing (..)\n${body}`,
    "Declared.elm": `port module Declared exposing (..)\nport outgoing : String -> Cmd msg\n${body}`,
  });
  const provider = createDiagnostics(program);
  const files = program.getSourceFiles();
  const check = (): void => {
    files.forEach((file) =>
      provider.forceElmLsDiagnosticsUpdate(file, program),
    );
  };

  // Warm binding, type caches, queries and JIT outside the measurement.
  for (let i = 0; i < 5; i++) check();
  expect(
    provider.getCurrentDiagnostics(uri("Empty")).map((d) => d.data.code),
  ).toEqual(["unnecessary_port_module"]);
  expect(provider.getCurrentDiagnostics(uri("Declared"))).toEqual([]);

  const start = performance.now();
  for (let i = 0; i < BATCH_ITERATIONS; i++) check();
  const elapsed = performance.now() - start;
  console.info(`Port-module batch: ${elapsed.toFixed(1)}ms`);
  expect(elapsed).toBeLessThan(PORT_MODULE_BATCH_BUDGET_MS);
}, 30000);

it("bounds workspace bookkeeping and refreshes only affected port modules", async () => {
  const unused = "module Main exposing (..)\nvalue = 1";
  const used =
    "module Main exposing (..)\nimport Ports0 exposing (incoming)\nsubscriptions = incoming identity";
  const sources: Record<string, string> = {
    "Platform/Sub.elm":
      "module Platform.Sub exposing (Sub)\ntype Sub msg = Sub",
    "Main.elm": unused,
  };
  for (let i = 0; i < UNRELATED_MODULES; i++) {
    sources[`Other${i}.elm`] = `module Other${i} exposing (..)\nvalue x = x`;
  }
  for (let i = 0; i < PORT_MODULES; i++) {
    sources[`Ports${i}.elm`] =
      `port module Ports${i} exposing (..)\nport incoming : (String -> msg) -> Sub msg`;
  }
  const program = await parser.getProgram(sources);
  const provider = createDiagnostics(program, true);
  const checks = jest.spyOn(
    container.resolve(ElmLsDiagnostics),
    "createDiagnostics",
  );
  // This is a tree-search boundary, not a mocked result. Restoring per-port
  // importer snapshots or scanning imports during references violates it.
  const importScans = jest.spyOn(TreeUtils, "findImportClauseByName");
  await jest.runAllTimersAsync();
  expect(checks).toHaveBeenCalledTimes(UNRELATED_MODULES + PORT_MODULES + 2);
  expect(importScans.mock.calls.length).toBe(0);
  for (let i = 0; i < PORT_MODULES; i++) {
    expect(
      provider
        .getCurrentDiagnostics(uri(`Ports${i}`))
        .some((d) => d.data.code === "unused_incoming_port"),
    ).toBe(true);
  }

  const changeMain = (text: string | undefined): void => {
    const forest = program.getForest();
    const previousDependencies = forest.getDependencyUris(uri("Main"));
    if (text === undefined) {
      forest.removeTree(uri("Main"));
      program.getTypeCache().invalidateProject();
      program.markAsDirty();
      deletions.fire({ uri: uri("Main"), previousDependencies });
    } else {
      const tree = container.resolve<Parser>("Parser").parse(text);
      if (!tree) throw new Error("Failed to parse caller");
      const sourceFile = forest.setSourceFile(
        uri("Main"),
        true,
        tree,
        false,
        false,
      );
      program.getTypeCache().invalidateProject();
      program.markAsDirty();
      changes.fire({ sourceFile, previousDependencies });
    }
  };
  const refresh = async (
    text: string | undefined,
    warning: boolean,
  ): Promise<void> => {
    checks.mockClear();
    changeMain(text);
    await jest.runAllTimersAsync();
    expect(
      provider
        .getCurrentDiagnostics(uri("Ports0"))
        .some((d) => d.data.code === "unused_incoming_port"),
    ).toBe(warning);
    expect(checks.mock.calls.map(([file]) => file.uri).sort()).toEqual(
      (text === undefined
        ? [uri("Ports0")]
        : [uri("Main"), uri("Ports0")]
      ).sort(),
    );
  };
  const cycle = async (): Promise<void> => {
    await refresh(used, false);
    await refresh(used.replace("incoming identity", "identity"), true);
    await refresh(used, false);
    await refresh(unused, true);
    await refresh(used, false);
    await refresh(undefined, true);
  };

  await cycle(); // Warm every edit/deletion path before measuring it.
  const start = performance.now();
  for (let i = 0; i < 3; i++) await cycle();
  const elapsed = performance.now() - start;
  console.info(`Port refresh cycles: ${elapsed.toFixed(1)}ms`);
  expect(elapsed).toBeLessThan(REFRESH_CYCLE_BUDGET_MS);
  expect(importScans.mock.calls.length).toBe(0);
}, 30000);
