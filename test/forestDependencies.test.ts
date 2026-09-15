import { beforeAll, expect, it } from "@jest/globals";
import { container } from "tsyringe";
import { Utils as UriUtils } from "vscode-uri";
import { Parser } from "web-tree-sitter";
import { bindTreeContainer } from "../src/compiler/binder.js";
import { SourceTreeParser, srcUri } from "./utils/sourceTreeParser.js";

const parser = new SourceTreeParser();
beforeAll(async () => {
  await parser.init();
});

it("updates dependency edges after import edits, module renames, creation and deletion", async () => {
  const uri = (name: string): string =>
    UriUtils.joinPath(srcUri, `${name}.elm`).toString();
  const program = await parser.getProgram({
    "Main.elm": "module Main exposing (..)\nimport Ports\nvalue = 1",
    "Ports.elm":
      "port module Ports exposing (..)\nport incoming : (String -> msg) -> Sub msg",
  });
  const forest = program.getForest();
  const update = (name: string, text: string): void => {
    const tree = container.resolve<Parser>("Parser").parse(text);
    if (!tree) throw new Error("Failed to parse source");
    forest.setSourceFile(uri(name), true, tree, false, false);
    program.markAsDirty();
    program.getForest();
  };
  const importers = (name: string): string[] =>
    forest.getImportingModules(uri(name)).map((file) => file.uri);

  expect(importers("Ports")).toEqual([uri("Main")]);
  const previousDependencies = forest.getDependencyUris(uri("Main"));
  update("Main", "module Main exposing (..)\nvalue = 1");
  expect(importers("Ports")).toEqual([]);
  expect(previousDependencies).toContain(uri("Ports"));

  update("Main", "module Main exposing (..)\nimport Renamed\nvalue = 1");
  expect(importers("Ports")).toEqual([]);
  update("Ports", "module Renamed exposing (..)\nvalue = 1");
  expect(importers("Ports")).toEqual([uri("Main")]);

  update("Main", "module Main exposing (..)\nimport New\nvalue = 1");
  update("New", "module New exposing (..)\nvalue = 1");
  expect(importers("New")).toEqual([uri("Main")]);
  expect(importers("Ports")).toEqual([]);

  forest.removeTree(uri("New"));
  program.markAsDirty();
  program.getForest();
  expect(forest.getDependencyUris(uri("Main"))).not.toContain(uri("New"));
  expect(importers("New")).toEqual([]);

  update("New", "module New exposing (..)\nvalue = 1");
  expect(importers("New")).toEqual([uri("Main")]);
  forest.removeTree(uri("Main"));
  program.markAsDirty();
  program.getForest();
  expect(importers("New")).toEqual([]);
  expect(forest.getDependencyUris(uri("Main"))).toEqual([]);
});

it("recollects ports when a source file is replaced", async () => {
  const program = await parser.getProgram({
    "Ports.elm":
      "port module Ports exposing (..)\nport incoming : (String -> msg) -> Sub msg",
  });
  const uri = UriUtils.joinPath(srcUri, "Ports.elm").toString();
  const sourceFile = program.getSourceFile(uri);
  if (!sourceFile) throw new Error("Missing Ports.elm");
  bindTreeContainer(sourceFile);
  expect(sourceFile.portAnnotations).toHaveLength(1);

  const tree = container
    .resolve<Parser>("Parser")
    .parse("module Ports exposing (..)\nvalue = 1");
  if (!tree) throw new Error("Failed to parse source");
  const replacement = program
    .getForest(false)
    .setSourceFile(uri, true, tree, false, false);
  bindTreeContainer(replacement);
  expect(replacement.portAnnotations).toEqual([]);
});
