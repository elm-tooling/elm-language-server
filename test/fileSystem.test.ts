import fs from "fs";
import os from "os";
import path from "path";
import { setTimeout as delay } from "node:timers/promises";
import { ExecaError, ExecaSyncError } from "execa";
import { mockDeep } from "jest-mock-extended";
import { Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import {
  createNodeFileSystemHost,
  execCmd,
  execCmdSync,
} from "../src/node/fileSystem.js";

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
  const connection = mockDeep<Connection>();
  const host = createNodeFileSystemHost(connection);

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

  it("delivers file changes until its watcher is disposed", async () => {
    const watchedFile = path.join(root, "watched.elm");
    fs.writeFileSync(watchedFile, "initial");
    let changes = 0;
    const watcher = host.watchFile(URI.file(watchedFile), () => changes++);

    try {
      for (let attempt = 0; changes === 0 && attempt < 20; attempt++) {
        await delay(50);
        fs.writeFileSync(watchedFile, `change ${attempt}`);
      }
      expect(changes).toBeGreaterThan(0);
    } finally {
      watcher.dispose();
    }

    await delay(200);
    const changesAfterDispose = changes;
    fs.writeFileSync(watchedFile, "after dispose");
    await delay(200);
    expect(changes).toBe(changesAfterDispose);
  });

  it("preserves command input and trailing newlines", async () => {
    const input = "output with newline\n";
    const script = "process.stdin.pipe(process.stdout)";

    expect(
      execCmdSync(
        connection,
        process.execPath,
        process.execPath,
        { cmdArguments: ["-e", script] },
        root,
        input,
      ).stdout,
    ).toBe(input);
    await expect(
      execCmd(
        connection,
        [process.execPath, ["-e", script]],
        [[process.execPath, []]],
        {},
        root,
        input,
      ),
    ).resolves.toMatchObject({ stdout: input });
  });

  it("throws typed command errors with captured output", async () => {
    let syncFailure: unknown;
    try {
      execCmdSync(
        connection,
        process.execPath,
        process.execPath,
        {
          cmdArguments: [
            "-e",
            'process.stderr.write("failure\\n"); process.exit(2)',
          ],
        },
        root,
      );
    } catch (error) {
      syncFailure = error;
    }
    expect(syncFailure).toBeInstanceOf(ExecaSyncError);
    expect(syncFailure).toMatchObject({ stderr: "failure\n", exitCode: 2 });

    let asyncFailure: unknown;
    try {
      await execCmd(
        connection,
        [
          process.execPath,
          ["-e", 'process.stderr.write("failure\\n"); process.exit(2)'],
        ],
        [[process.execPath, []]],
        {},
        root,
      );
    } catch (error) {
      asyncFailure = error;
    }
    expect(asyncFailure).toBeInstanceOf(ExecaError);
    expect(asyncFailure).toMatchObject({ stderr: "failure\n", exitCode: 2 });
  });

  it("falls back to the next built-in command when one is missing", async () => {
    await expect(
      execCmd(
        connection,
        ["", []],
        [
          ["elm-language-server-command-that-does-not-exist", []],
          [process.execPath, ["-e", 'process.stdout.write("fallback")']],
        ],
        {},
        root,
      ),
    ).resolves.toMatchObject({ stdout: "fallback" });
  });

  it("prefers commands installed in the workspace", async () => {
    const command = "elm-language-server-local-command";
    const binDirectory = path.join(root, "node_modules", ".bin");
    fs.mkdirSync(binDirectory, { recursive: true });
    const executable = path.join(binDirectory, command);
    fs.writeFileSync(
      executable,
      '#!/usr/bin/env node\nprocess.stdout.write("local")\n',
    );
    fs.chmodSync(executable, 0o755);
    fs.writeFileSync(
      `${executable}.cmd`,
      "@node -e \"process.stdout.write('local')\"\r\n",
    );

    await expect(
      execCmd(connection, ["", []], [[command, []]], {}, root),
    ).resolves.toMatchObject({ stdout: "local" });
  });
});
