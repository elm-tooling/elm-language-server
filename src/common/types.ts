import { URI } from "vscode-uri";
import { IClientSettings } from "./util/settings.js";
import { NonEmptyArray } from "./util/utils.js";
import type { Result, SyncResult } from "execa";
import { Disposable } from "vscode-languageserver";

export type ExecResult = Result<{ encoding: "utf8" }>;
export type ExecSyncResult = SyncResult<{ encoding: "utf8" }>;

export interface IFileSystemHost {
  readFile(uri: URI): Promise<string>;
  readFileSync(uri: URI): string;
  readDirectory(uri: URI, include?: string, depth?: number): Promise<URI[]>;
  readDirectorySync?(
    uri: URI,
    include?: string[],
    exclude?: string[],
    depth?: number,
  ): URI[];
  fileExists(uri: URI): boolean;
  watchFile(uri: URI, callback: () => void): Disposable;
  getElmPackagesRoot(rootPath: URI, clientSettings: IClientSettings): URI;
  execCmdSync?(
    cmdFromUser: string,
    cmdStatic: string,
    options: IExecCmdSyncOptions,
    cwd: string,
    input?: string,
  ): ExecSyncResult;
  execCmd?(
    cmdFromUser: [string, string[]],
    cmdStatic: NonEmptyArray<[string, string[]]>,
    options: IExecCmdOptions,
    cwd: string,
    input?: string,
  ): Promise<ExecResult>;
}

export type InitializationOptions = IClientSettings & {
  treeSitterWasmUri?: string;
  treeSitterElmWasmUri?: string;

  // Needed to support virtual workspaces
  elmJsonFiles?: string[];
};

/** Options for execCmdSync */
export interface IExecCmdSyncOptions {
  /** Any arguments */
  cmdArguments?: string[];
  /** Text to add when command is not found (maybe helping how to install) */
  notFoundText?: string;
}

/** Options for execCmd */
export interface IExecCmdOptions {
  /** Text to add when command is not found (maybe helping how to install)
   * Unlike the sync version, it’s required here (since `cmdStatic` has fallbacks).
   */
  notFoundText: string;
}
