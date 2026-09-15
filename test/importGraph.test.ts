import { afterEach, beforeAll, expect, it, jest } from "@jest/globals";
import { Utils as UriUtils } from "vscode-uri";
import { Imports } from "../src/compiler/imports.js";
import { References } from "../src/compiler/references.js";
import { SourceTreeParser, srcUri } from "./utils/sourceTreeParser.js";

const parser = new SourceTreeParser();
beforeAll(async () => {
  await parser.init();
});
afterEach(() => jest.restoreAllMocks());

it("finds direct and transitive importers without constructing symbol imports", async () => {
  const program = await parser.getProgram({
    "A.elm": "module A exposing (..)\nimport C\na = 1",
    "B.elm": "module B exposing (..)\nimport A\nb = 1",
    "C.elm": "module C exposing (..)\nimport B\nc = 1",
    "Other.elm": "module Other exposing (..)\nother = 1",
  });
  const a = program.getSourceFile(
    UriUtils.joinPath(srcUri, "A.elm").toString(),
  );
  if (!a) throw new Error("Missing A.elm");
  const checker = program.getTypeChecker();
  const resolveImports = jest.spyOn(Imports, "getImports");

  expect(
    checker.getImportingModules(a, true).map((file) => file.moduleName),
  ).toEqual(["B"]);
  expect(checker.getImportingModules(a).map((file) => file.moduleName)).toEqual(
    ["B", "C"],
  );
  expect(resolveImports).not.toHaveBeenCalled();
});

it("limits reference searches to the definition and its resolved importers", async () => {
  const program = await parser.getProgram({
    "Ports.elm":
      "port module Ports exposing (..)\nport incoming : (String -> msg) -> Sub msg",
    "Main.elm":
      "module Main exposing (..)\nimport Ports as P\nsubscriptions = P.incoming identity",
    "Other.elm": "module Other exposing (..)\nvalue = 1",
  });
  const ports = program.getSourceFile(
    UriUtils.joinPath(srcUri, "Ports.elm").toString(),
  );
  if (!ports) throw new Error("Missing Ports.elm");
  const checker = program.getTypeChecker();
  const symbol = ports.symbolLinks?.get(ports.tree.rootNode)?.get("incoming");
  if (!symbol) throw new Error("Missing port symbol");
  const getImports = jest.spyOn(checker, "getAllImports");

  expect(
    References.find(symbol, program).map(({ node, uri }) => ({
      name: node.text,
      module: program.getSourceFile(uri)?.moduleName,
    })),
  ).toEqual([
    { name: "incoming", module: "Ports" },
    { name: "incoming", module: "Main" },
  ]);
  expect(getImports.mock.calls.map(([file]) => file.moduleName)).toEqual([
    "Main",
  ]);
});

it("does not resolve importer symbols when finding a private function's references", async () => {
  const program = await parser.getProgram({
    "Helpers.elm":
      "module Helpers exposing (public)\nlocal = 1\npublic = local",
    "Main.elm":
      "module Main exposing (..)\nimport Helpers\nvalue = Helpers.public",
  });
  const helpers = program.getSourceFile(
    UriUtils.joinPath(srcUri, "Helpers.elm").toString(),
  );
  if (!helpers) throw new Error("Missing Helpers.elm");
  const checker = program.getTypeChecker();
  const symbol = helpers.symbolLinks?.get(helpers.tree.rootNode)?.get("local");
  if (!symbol) throw new Error("Missing local function");
  const getImports = jest.spyOn(checker, "getAllImports");

  expect(References.find(symbol, program).map(({ node }) => node.text)).toEqual(
    ["local", "local"],
  );
  expect(getImports).not.toHaveBeenCalled();
});
