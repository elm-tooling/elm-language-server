#!/usr/bin/env node
import fs from "fs";
import globby from "globby";
import util from "util";
import chokidar from "chokidar";
import {
  IExecCmdOptions,
  IExecCmdSyncOptions,
  IFileSystemHost,
} from "../types";
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
  virtualPackagesRoot,
} from "../common";
import { getCancellationStrategyFromArgv } from "../cancellation.node";
import os from "os";
import execa, { ExecaSyncReturnValue } from "execa";
import { NonEmptyArray } from "../util/utils";
import { IClientSettings } from "../util/settings";

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

  // Don't die on unhandled Promise rejections
  process.on("unhandledRejection", (reason, p) => {
    connection.console.error(
      `Unhandled Rejection at: Promise ${p} reason:, ${reason}`,
    );
  });
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

          const bytes = await connection.sendRequest(
            ReadFileRequest,
            uri.toString(),
          );
          return new TextDecoder().decode(new Uint8Array(bytes));
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
    readFileSync: (uri): string => fs.readFileSync(uri.fsPath, "utf-8"),
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
    readDirectorySync: (uri, include, exclude, depth): URI[] => {
      const result =
        depth === 1
          ? fs.readdirSync(uri.fsPath)
          : globby.sync(
              // Cleanup the path on windows, as globby does not like backslashes
              [
                ...(include?.map((path) =>
                  Utils.joinPath(uri, path).fsPath.replace(/\\/g, "/"),
                ) ?? []),
                ...(exclude?.map(
                  (path) =>
                    `!${Utils.joinPath(uri, path).fsPath.replace(/\\/g, "/")}`,
                ) ?? []),
              ],
              {
                suppressErrors: true,
              },
            );
      return result.map((path) => URI.file(path));
    },
    fileExists: (uri): boolean =>
      uri.scheme === "file" && fs.existsSync(uri.fsPath),
    watchFile: (uri, callback): void => {
      const realUri = convertToFileSystemUri(uri);
      if (realUri.scheme === "file") {
        chokidar.watch(realUri.fsPath).on("change", callback);
      }
    },
    getElmPackagesRoot: (rootPath, clientSettings): URI => {
      const isVirtualFileSystem = rootPath.scheme !== "file";

      let elmVersion;
      if (isVirtualFileSystem) {
        elmVersion = "0.19.1";
      } else {
        try {
          elmVersion = getElmVersion(clientSettings, rootPath, connection);
        } catch (error) {
          if (error instanceof Error && error.stack) {
            connection.console.warn(
              `Could not figure out elm version, this will impact how good the server works. \n ${error.stack}`,
            );
          }

          if (!elmVersion) {
            connection.console.warn(`Using elm 0.19.1 as a default`);
            elmVersion = "0.19.1";
          }
        }
      }

      if (isVirtualFileSystem) {
        return virtualPackagesRoot;
      } else {
        const elmHome = findElmHome();
        const packagesRoot = URI.file(
          `${elmHome}/${elmVersion}/${packageOrPackagesFolder(elmVersion)}/`,
        );

        // Run `elm make` to download dependencies
        try {
          execCmdSync(
            connection,
            clientSettings.elmPath,
            "elm",
            { cmdArguments: ["make"] },
            rootPath.fsPath,
          );
        } catch (error) {
          // On application projects, this will give a NO INPUT error message, but will still download the dependencies
        }

        return packagesRoot;
      }
    },
    execCmdSync: (...args) => execCmdSync(connection, ...args),
    execCmd: (...args) => execCmd(connection, ...args),
  };
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

export const isWindows = process.platform === "win32";

function findElmHome(): string {
  const elmHomeVar = process.env.ELM_HOME;

  if (elmHomeVar) {
    return elmHomeVar;
  }

  return isWindows
    ? `${os.homedir()}/AppData/Roaming/elm`
    : `${os.homedir()}/.elm`;
}

/** Executes a command. Shows an error message if the command isn't found */
export function execCmdSync(
  connection: Connection,
  cmdFromUser: string,
  cmdStatic: string,
  options: IExecCmdSyncOptions = {},
  cwd: string,
  input?: string,
): ExecaSyncReturnValue<string> {
  const cmd = cmdFromUser === "" ? cmdStatic : cmdFromUser;
  const preferLocal = cmdFromUser === "";

  const cmdArguments = options ? options.cmdArguments : [];

  try {
    return execa.sync(cmd, cmdArguments, {
      cwd,
      input,
      preferLocal,
      stripFinalNewline: false,
    });
  } catch (error: unknown) {
    connection.console.warn(JSON.stringify(error));
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      connection.window.showErrorMessage(
        options.notFoundText
          ? options.notFoundText + ` I'm looking for '${cmd}' at '${cwd}'`
          : `Cannot find executable with name '${cmd}'`,
      );
      throw "Executable not found";
    } else {
      throw error;
    }
  }
}

export async function execCmd(
  connection: Connection,
  cmdFromUser: [string, string[]],
  cmdStatic: NonEmptyArray<[string, string[]]>,
  options: IExecCmdOptions,
  cwd: string,
  input?: string,
): Promise<ExecaSyncReturnValue<string>> {
  const [cmd, args] = cmdFromUser[0] === "" ? cmdStatic[0] : cmdFromUser;
  const preferLocal = cmdFromUser[0] === "";

  try {
    return await execa(cmd, args, {
      cwd,
      input,
      preferLocal,
      stripFinalNewline: false,
    });
  } catch (error: unknown) {
    let notFound = false;
    if (error && typeof error === "object" && "code" in error) {
      notFound = error.code === "ENOENT";
      if (notFound && cmdStatic.length > 1) {
        return execCmd(
          connection,
          cmdFromUser,
          cmdStatic.slice(1) as NonEmptyArray<[string, string[]]>,
          options,
          cwd,
          input,
        );
      }
    }
    connection.console.warn(JSON.stringify(error));
    if (notFound) {
      connection.window.showErrorMessage(
        options.notFoundText + ` I'm looking for commands at '${cwd}'`,
      );
      throw "Executable not found";
    } else {
      throw error;
    }
  }
}

function getElmVersion(
  settings: IClientSettings,
  elmWorkspaceFolder: URI,
  connection: Connection,
): string {
  const options = {
    cmdArguments: ["--version"],
    notFoundText:
      "Elm binary not found, did you install and setup the path to your binary?",
  };

  const result = execCmdSync(
    connection,
    settings.elmPath,
    "elm",
    options,
    elmWorkspaceFolder.fsPath,
  );

  const version = result.stdout.trim();

  connection.console.info(`Elm version ${version} detected.`);

  return version;
}

function packageOrPackagesFolder(elmVersion: string | undefined): string {
  return elmVersion === "0.19.0" ? "package" : "packages";
}
