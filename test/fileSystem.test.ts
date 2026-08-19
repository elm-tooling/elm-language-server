import fs from "fs";
import os from "os";
import path from "path";
import { mockDeep } from "jest-mock-extended";
import { Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { createNodeFileSystemHost } from "../src/node/fileSystem.js";

function toFileUris(paths: string[]): string[] {
  return paths.map((filePath) => URI.file(filePath).toString()).sort();
}

describe("node file system", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elm-language-server-"));
  const nested = path.join(root, "nested");
  const ignored = path.join(root, "ignored");
  const rootElm = path.join(root, "Root.elm");
  const nestedElm = path.join(nested, "Nested.elm");
  const ignoredElm = path.join(ignored, "Ignored.elm");
  const host = createNodeFileSystemHost(mockDeep<Connection>());

  beforeAll(() => {
    fs.mkdirSync(nested);
    fs.mkdirSync(ignored);
    fs.writeFileSync(rootElm, "module Root exposing (..)");
    fs.writeFileSync(nestedElm, "module Nested exposing (..)");
    fs.writeFileSync(ignoredElm, "module Ignored exposing (..)");
    fs.writeFileSync(path.join(nested, "notes.txt"), "not Elm");
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("recursively reads matching files as absolute file URIs", async () => {
    const result = await host.readDirectory(URI.file(root), "**/*.elm");

    expect(result.map((uri) => uri.toString()).sort()).toEqual(
      toFileUris([ignoredElm, nestedElm, rootElm]),
    );
    expect(result.every((uri) => uri.scheme === "file")).toBe(true);
  });

  it("applies include and exclude patterns to synchronous reads", () => {
    if (!host.readDirectorySync) {
      throw new Error("The Node file system must support synchronous reads");
    }

    const result = host.readDirectorySync(
      URI.file(root),
      ["**/*.elm"],
      ["ignored/**"],
    );

    expect(result.map((uri) => uri.toString()).sort()).toEqual(
      toFileUris([nestedElm, rootElm]),
    );
  });

  it("returns no recursive matches for a missing directory", async () => {
    const missing = URI.file(path.join(root, "missing"));

    await expect(host.readDirectory(missing, "**/*.elm")).resolves.toEqual([]);
    expect(host.readDirectorySync?.(missing, ["**/*.elm"])).toEqual([]);
  });
});
