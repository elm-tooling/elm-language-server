#!/usr/bin/env node
import fs from "fs";
import globby from "globby";
import util from "util";
import chokidar from "chokidar";
import { IFileSystemHost } from "../types";
import { URI, Utils } from "vscode-uri";
import { xhr, XHRResponse, getErrorStatusDescription } from "request-light";
import { ReadDirectoryRequest, ReadFileRequest } from "../protocol";
import {
  Connection,
  ProposedFeatures,
  createConnection,
} from "vscode-languageserver/node";
import {
  convertToFileSystemUri,
  startCommonServer,
  readFileWithCachedVirtualPackageFile,
} from "../common";
import { findElmHome } from "../compiler/utils/elmUtils";
import { getCancellationStrategyFromArgv } from "../cancellation";

const readFile = util.promisify(fs.readFile);
const readDir = util.promisify(fs.readdir);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);

export function startLanguageServer(): void {
  // default argument `--stdio`
  if (process.argv.length === 2) {
    process.argv.push("--stdio");
  }

  const connection = createConnection(ProposedFeatures.all, {
    cancellationStrategy: getCancellationStrategyFromArgv(process.argv),
  });

  startCommonServer(connection, createNodeFileSystemHost(connection));
}

export function createNodeFileSystemHost(
  connection: Connection,
): IFileSystemHost {
  return {
    readFile: (uri): Promise<string> =>
      readFileWithCachedVirtualPackageFile(
        uri,
        async (uri) => {
          const schemaProvider = schemaProviders[uri.scheme];

          if (schemaProvider) {
            return (await schemaProvider(uri)) ?? "";
          }

          return await connection.sendRequest(ReadFileRequest, uri.toString());
        },
        {
          getVirtualPackageRoot,
          get: (uri) => schemaProviders["file"](uri),
          set: async (uri, value) => {
            await mkdir(Utils.dirname(uri).fsPath, { recursive: true });
            await writeFile(uri.fsPath, value, { flag: "w+" });
          },
        },
      ),
    readDirectory: async (uri, include, depth): Promise<URI[]> => {
      const realUri = convertToFileSystemUri(uri);
      if (realUri.scheme === "http" || realUri.scheme === "https") {
        return [];
      }

      if (realUri.scheme === "file") {
        const result =
          depth === 1
            ? await readDir(realUri.fsPath)
            : await globby(
                // Cleanup the path on windows, as globby does not like backslashes
                Utils.joinPath(realUri, include ?? "**").fsPath.replace(
                  /\\/g,
                  "/",
                ),
                {
                  suppressErrors: true,
                },
              );

        return result.map((path) => URI.file(path));
      } else {
        const result = await connection.sendRequest(
          ReadDirectoryRequest,
          realUri.toString(),
        );
        return result.map((path) => URI.parse(path));
      }
    },
    watchFile: (uri, callback): void => {
      const realUri = convertToFileSystemUri(uri);
      if (realUri.scheme === "file") {
        chokidar.watch(realUri.fsPath).on("change", callback);
      }
    },
  };
}

export function findElmJsonFiles(uri: URI): string[] {
  const globUri = uri.fsPath.replace(/\\/g, "/").replace(/\/$/, "");
  const elmJsonGlob = `${globUri}/**/elm.json`;

  return globby.sync([elmJsonGlob, "!**/node_modules/**", "!**/elm-stuff/**"], {
    suppressErrors: true,
  });
}

const schemaProviders: {
  [schema: string]: (uri: URI) => Promise<string | undefined>;
} = {
  http: loadFileFromHttp,
  https: loadFileFromHttp,
  file: async (uri) => {
    try {
      return await readFile(uri.fsPath, "utf-8");
    } catch {
      return undefined;
    }
  },
};

function loadFileFromHttp(uri: URI): Promise<string | undefined> {
  const headers = { "Accept-Encoding": "gzip, deflate" };
  return xhr({ url: uri.toString(), followRedirects: 5, headers }).then(
    (response) => {
      if (response.status !== 200) {
        return;
      }
      return response.responseText;
    },
    (error: XHRResponse) => {
      return Promise.reject(
        error.responseText ||
          getErrorStatusDescription(error.status) ||
          error.toString(),
      );
    },
  );
}

function getVirtualPackageRoot(): URI {
  return Utils.joinPath(
    URI.file(findElmHome()),
    "elm-language-server",
    "packages",
  );
}
