import { Connection } from "vscode-languageserver";
import { IFileSystemHost } from "../types";
import { ReadDirectoryRequest, ReadFileRequest } from "../protocol";
import {
  convertToFileSystemUri,
  readFileWithCachedVirtualPackageFile,
} from "../common";
import { URI } from "vscode-uri";

export function createWebFileSystemHost(
  connection: Connection,
): IFileSystemHost {
  return {
    readFile: (uri): Promise<string> =>
      readFileWithCachedVirtualPackageFile(
        uri,
        (uri) => connection.sendRequest(ReadFileRequest, uri.toString()),
        {
          // TODO: Use indexed DB to store package files in the browser
          getVirtualPackageRoot: () => uri,
          get: (uri) => Promise.resolve(undefined),
          set: async (uri, value) => {
            //
          },
        },
      ),
    readDirectory: async (uri): Promise<URI[]> => {
      const result = await connection.sendRequest(
        ReadDirectoryRequest,
        convertToFileSystemUri(uri).toString(),
      );
      return result.map((path) => URI.parse(path));
    },
    watchFile: (uri, callback: () => void): void => {
      //
    },
  };
}
