import { afterEach, expect, it, jest } from "@jest/globals";
import { mockDeep } from "jest-mock-extended";
import { container } from "tsyringe";
import { Connection, Disposable, Emitter } from "vscode-languageserver";
import { Utils as UriUtils } from "vscode-uri";
import { Parser } from "web-tree-sitter";
import { ASTProvider } from "../../src/common/providers/astProvider.js";
import { DiagnosticsProvider } from "../../src/common/providers/diagnostics/diagnosticsProvider.js";
import { ElmLsDiagnostics } from "../../src/common/providers/diagnostics/elmLsDiagnostics.js";
import { TextDocumentEvents } from "../../src/common/util/textDocumentEvents.js";
import { ISourceFile } from "../../src/compiler/forest.js";
import { SourceTreeParser, srcUri } from "../utils/sourceTreeParser.js";

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("refreshes only affected closed port modules when usage is added, removed, or deleted", async () => {
  const parser = new SourceTreeParser();
  await parser.init();
  const mainUri = UriUtils.joinPath(srcUri, "Main.elm").toString();
  const portUri = UriUtils.joinPath(srcUri, "Ports.elm").toString();
  const otherUri = UriUtils.joinPath(srcUri, "Other.elm").toString();
  const unused = "module Main exposing (..)\nvalue = 1";
  const used = `module Main exposing (..)
import Ports exposing (inPort)
subscriptions = inPort identity`;
  const program = await parser.getProgram({
    "Platform/Sub.elm":
      "module Platform.Sub exposing (Sub)\ntype Sub msg = Sub",
    "Ports.elm": `port module Ports exposing (..)
port inPort : (String -> msg) -> Sub msg`,
    "Other.elm": `port module Other exposing (..)
port otherPort : (String -> msg) -> Sub msg`,
    "Main.elm": unused,
  });
  const changes = new Emitter<{
    sourceFile: ISourceFile;
    previousDependencies: readonly string[];
  }>();
  const deletions = new Emitter<{
    uri: string;
    previousDependencies: readonly string[];
  }>();
  container.register("ElmWorkspaces", { useValue: [program] });
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
  const connection = container.resolve<Connection>("Connection");
  jest
    .spyOn(connection, "onDidChangeConfiguration")
    .mockReturnValue(Disposable.create(() => {}));
  const elmLsDiagnostics = new ElmLsDiagnostics();
  container.register(ElmLsDiagnostics, { useValue: elmLsDiagnostics });
  const checks = jest.spyOn(elmLsDiagnostics, "createDiagnostics");
  jest.useFakeTimers();
  const diagnostics = new DiagnosticsProvider();

  const hasWarning = (): boolean =>
    diagnostics
      .getCurrentDiagnostics(portUri)
      .some((diagnostic) => diagnostic.data.code === "unused_incoming_port");
  const changeMain = (text: string): void => {
    const previousDependencies = program.getForest().getDependencyUris(mainUri);
    const tree = container.resolve<Parser>("Parser").parse(text);
    if (!tree) throw new Error("Failed to parse Main.elm");
    const sourceFile = program
      .getForest(false)
      .setSourceFile(
        mainUri,
        true,
        tree,
        false,
        false,
        program.getSourceFile(mainUri)?.project,
      );
    program.getTypeCache().invalidateProject();
    program.markAsDirty();
    changes.fire({ sourceFile, previousDependencies });
  };

  try {
    await jest.runAllTimersAsync();
    expect(hasWarning()).toBe(true);
    checks.mockClear();

    changeMain(used);
    await jest.runAllTimersAsync();
    expect(hasWarning()).toBe(false);

    changeMain(used.replace("inPort identity", "identity"));
    await jest.runAllTimersAsync();
    expect(hasWarning()).toBe(true);

    changeMain(used);
    await jest.runAllTimersAsync();
    expect(hasWarning()).toBe(false);

    // Removing the import must still refresh the previously imported module.
    changeMain(unused);
    await jest.runAllTimersAsync();
    expect(hasWarning()).toBe(true);

    changeMain(used);
    await jest.runAllTimersAsync();
    expect(hasWarning()).toBe(false);

    const previousDependencies = program.getForest().getDependencyUris(mainUri);
    program.getForest(false).removeTree(mainUri);
    program.getTypeCache().invalidateProject();
    program.markAsDirty();
    deletions.fire({ uri: mainUri, previousDependencies });
    await jest.runAllTimersAsync();
    expect(hasWarning()).toBe(true);

    expect(checks.mock.calls.some(([file]) => file.uri === otherUri)).toBe(
      false,
    );
  } finally {
    diagnostics.dispose();
    changes.dispose();
    deletions.dispose();
  }
});
