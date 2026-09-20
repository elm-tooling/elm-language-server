import { afterEach, expect, it, jest } from "@jest/globals";
import { mockDeep } from "jest-mock-extended";
import { container } from "tsyringe";
import {
  Connection,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  Disposable,
  Emitter,
} from "vscode-languageserver";
import { ASTProvider } from "../../src/common/providers/astProvider.js";
import { DiagnosticsProvider } from "../../src/common/providers/diagnostics/diagnosticsProvider.js";
import { ElmMakeDiagnostics } from "../../src/common/providers/diagnostics/elmMakeDiagnostics.js";
import { ElmReviewDiagnostics } from "../../src/common/providers/diagnostics/elmReviewDiagnostics.js";
import { IFileSystemHost } from "../../src/common/types.js";
import { TextDocumentEvents } from "../../src/common/util/textDocumentEvents.js";
import { SourceTreeParser } from "../utils/sourceTreeParser.js";
import { URI } from "vscode-uri";
import { IProgram } from "../../src/compiler/program.js";

afterEach(() => jest.restoreAllMocks());

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("does not overlap compiler commands when documents open together", async () => {
  const parser = new SourceTreeParser();
  await parser.init();
  const program = await parser.getProgram(
    Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => [
        `tests/Tests${index}.elm`,
        `module Tests${index} exposing (..)\nvalue = 1`,
      ]),
    ),
  );
  const opens = new Emitter<DidOpenTextDocumentParams>();
  const saves = new Emitter<DidSaveTextDocumentParams>();
  container.register("ElmWorkspaces", { useValue: [program] });
  container.register(ASTProvider, {
    useValue: mockDeep<ASTProvider>({
      onTreeChange: () => Disposable.create(() => {}),
      onTreeDelete: () => Disposable.create(() => {}),
    }),
  });
  container.register(TextDocumentEvents, {
    useValue: mockDeep<TextDocumentEvents>({
      getOpenUris: () => [],
      onDidOpen: opens.event,
      onDidSave: saves.event,
      onDidChange: () => Disposable.create(() => {}),
    }),
  });
  const connection = container.resolve<Connection>("Connection");
  jest
    .spyOn(connection, "onDidChangeConfiguration")
    .mockReturnValue(Disposable.create(() => {}));
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let active = 0;
  let maximum = 0;
  const commands: string[][] = [];
  const host = mockDeep<IFileSystemHost>();
  host.execCmd = async (command) => {
    commands.push(command[1]);
    maximum = Math.max(maximum, ++active);
    await blocked;
    active--;
    return "";
  };
  container.register(ElmMakeDiagnostics, {
    useValue: new ElmMakeDiagnostics(host),
  });
  container.register(ElmReviewDiagnostics, {
    useValue: mockDeep<ElmReviewDiagnostics>({
      createDiagnostics: () => Promise.resolve(new Map()),
    }),
  });
  const diagnostics = new DiagnosticsProvider();
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(commands).toHaveLength(0);
    // Restore/open notifications can arrive in a burst without a test run request.
    for (const file of program
      .getSourceFiles()
      .filter((file) => file.isTestFile)) {
      opens.fire({
        textDocument: {
          uri: file.uri,
          languageId: "elm",
          version: 1,
          text: "",
        },
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((args) => args[0] === "make")).toBe(true);
    expect(maximum).toBe(1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(commands).toHaveLength(2);
    expect(active).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(commands).toHaveLength(2);
  } finally {
    release();
    await new Promise((resolve) => setTimeout(resolve, 300));
    diagnostics.dispose();
    opens.dispose();
    saves.dispose();
    jest.restoreAllMocks();
  }
});

it.each([true, false])(
  "compiles all queued files absent from the forest and returns each file's diagnostics (compiler paths: %s)",
  async (hasPaths) => {
    const parser = new SourceTreeParser();
    await parser.init();
    const program = await parser.getProgram({
      "tests/First.elm": "module First exposing (..)\nvalue = 1",
      "tests/Second.elm": "module Second exposing (..)\nvalue = 2",
      "tests/Third.elm": "module Third exposing (..)\nvalue = 3",
    });
    const files = program.getSourceFiles().filter((file) => file.isTestFile);
    container.register("ElmWorkspaces", { useValue: [program] });
    // A newly opened file may already be known to the caller but absent from
    // the compiler's forest snapshot. Assert actual command inputs in this case.
    jest.spyOn(program, "getSourceFiles").mockReturnValue([]);
    const started = deferred<void>();
    const release = deferred<void>();
    const host = mockDeep<IFileSystemHost>();
    const commands: string[][] = [];
    host.execCmd = async ([, args]) => {
      commands.push(args);
      if (commands.length === 1) {
        started.resolve();
        await release.promise;
        return "";
      }
      throw {
        stderr: JSON.stringify(
          hasPaths
            ? {
                type: "compile-errors",
                errors: args
                  .filter((arg) => arg.endsWith(".elm"))
                  .map((file) => ({
                    path: file,
                    name: file,
                    problems: [
                      {
                        title: "TYPE MISMATCH",
                        message: [file],
                        region: {
                          start: { line: 1, column: 1 },
                          end: { line: 1, column: 2 },
                        },
                      },
                    ],
                  })),
              }
            : {
                type: "error",
                title: "TYPE MISMATCH",
                message: ["project error"],
              },
        ),
      };
    };
    const diagnostics = new ElmMakeDiagnostics(host);
    const first = diagnostics.createDiagnostics(files[0]);
    await started.promise;
    const second = diagnostics.createDiagnostics(files[1]);
    const third = diagnostics.createDiagnostics(files[2]);
    release.resolve();
    const results = await Promise.all([first, second, third]);
    expect(commands).toHaveLength(2);
    const expectedPaths = files
      .slice(1)
      .map((file) => `tests/${URI.parse(file.uri).path.split("/").pop()}`);
    expect(commands[1].filter((arg) => arg.endsWith(".elm"))).toEqual(
      expectedPaths,
    );
    for (const result of results.slice(1)) {
      for (const file of files.slice(1)) {
        expect(result.get(file.uri)).toHaveLength(1);
        expect(result.get(file.uri)![0].message).toContain("TYPE MISMATCH");
      }
    }
    // An empty queue must not prevent a later save from compiling again.
    await diagnostics.createDiagnostics(files[0]);
    expect(commands).toHaveLength(3);
  },
);

it("allows separate projects to compile independently", async () => {
  const parser = new SourceTreeParser();
  await parser.init();
  const program = await parser.getProgram({
    "tests/Tests.elm": "module Tests exposing (..)\nvalue = 1",
  });
  const file = program.getSourceFiles().find((file) => file.isTestFile)!;
  const otherRoot = URI.file("/other-project");
  const otherFile = {
    ...file,
    uri: URI.file("/other-project/tests/Tests.elm").toString(),
  };
  const other = mockDeep<IProgram>({
    getRootPath: () => otherRoot,
    getSourceFiles: () => [otherFile],
    hasDocument: (uri) => uri.toString() === otherFile.uri,
  });
  container.register("ElmWorkspaces", { useValue: [program, other] });
  const release = deferred<void>();
  const bothStarted = deferred<void>();
  const roots: string[] = [];
  const host = mockDeep<IFileSystemHost>();
  host.execCmd = async (_command, _alternatives, _options, cwd) => {
    roots.push(cwd);
    if (roots.length === 2) bothStarted.resolve();
    await release.promise;
    return "";
  };
  const diagnostics = new ElmMakeDiagnostics(host);
  const results = [
    diagnostics.createDiagnostics(file),
    diagnostics.createDiagnostics(otherFile),
  ];
  try {
    await bothStarted.promise;
    expect(new Set(roots)).toEqual(
      new Set([program.getRootPath().fsPath, otherRoot.fsPath]),
    );
  } finally {
    release.resolve();
    await Promise.all(results);
  }
});
