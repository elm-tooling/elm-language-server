import { URI } from "vscode-uri";

export interface IFileSystemHost {
  readFile(uri: URI): Promise<string>;
  readDirectory(uri: URI, include?: string, depth?: number): Promise<URI[]>;
  watchFile(uri: URI, callback: () => void): void;
}
