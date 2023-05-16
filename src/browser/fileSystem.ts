import { Connection, Disposable } from "vscode-languageserver/browser";
import { IFileSystemHost } from "../common/types";
import { ReadDirectoryRequest, ReadFileRequest } from "../common/protocol";
import {
  convertToFileSystemUri,
  readFileWithCachedVirtualPackageFile,
  virtualPackagesRoot,
} from "../common";
import { URI } from "vscode-uri";
import { XHRResponse, getErrorStatusDescription, xhr } from "request-light";

export function createWebFileSystemHost(
  connection: Connection,
): IFileSystemHost {
  return {
    readFile: (uri): Promise<string> =>
      readFileWithCachedVirtualPackageFile(
        uri,
        async (uri) => {
          // TODO: I thought that VSCode provided a https file system provider in the web
          if (uri.scheme === "http" || uri.scheme === "https") {
            return (await loadFileFromHttp(uri)) ?? "";
          }

          const bytes = await connection.sendRequest(
            ReadFileRequest,
            uri.toString(),
          );
          return new TextDecoder().decode(new Uint8Array(bytes));
        },
        {
          // TODO: Use indexed DB to store package files in the browser
          getVirtualPackageRoot: () => uri,
          get: (uri) => Promise.resolve(undefined),
          set: async (uri, value) => {
            //
          },
        },
      ),
    readFileSync: (): string => "",
    readDirectory: async (uri): Promise<URI[]> => {
      const result = await connection.sendRequest(
        ReadDirectoryRequest,
        convertToFileSystemUri(uri).toString(),
      );
      return result.map((path) => URI.parse(path));
    },
    fileExists: (): boolean => false,
    watchFile: (): Disposable => {
      return Disposable.create(() => {
        //
      });
    },
    getElmPackagesRoot: () => virtualPackagesRoot,
  };
}

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
