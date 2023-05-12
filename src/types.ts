import { URI } from "vscode-uri";
import { IClientSettings } from "./util/settings";

export interface IFileSystemHost {
  readFile(uri: URI): Promise<string>;
  readDirectory(uri: URI, include?: string, depth?: number): Promise<URI[]>;
  watchFile(uri: URI, callback: () => void): void;
}

export type InitializationOptions = IClientSettings & {
  treeSitterWasmUri?: string;

  // Needed to support virtual workspaces
  elmJsonFiles?: string[];
};
