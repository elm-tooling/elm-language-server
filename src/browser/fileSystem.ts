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
import { IndexedDB } from "./indexedDB";

export function createWebFileSystemHost(
  connection: Connection,
): IFileSystemHost {
  let indexedDbFileSystemProvider: IIndexedDBFileSystemProvider | undefined;
  const getFileSystemProvider =
    async (): Promise<IIndexedDBFileSystemProvider> => {
      if (!indexedDbFileSystemProvider) {
        indexedDbFileSystemProvider = await getIndexedDbFileSystemProvider();
      }
      return indexedDbFileSystemProvider;
    };

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
          getVirtualPackageRoot: () => virtualPackagesRoot,
          get: async (uri) => {
            try {
              const provider = await getFileSystemProvider();
              const result = await provider.readFile(uri);
              return new TextDecoder().decode(result);
            } catch {
              return undefined;
            }
          },
          set: async (uri, value) => {
            try {
              const provider = await getFileSystemProvider();
              await provider.writeFile(uri, new TextEncoder().encode(value));
            } catch {
              //
            }
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

interface IIndexedDBFileSystemProvider {
  readFile(resource: URI): Promise<Uint8Array>;
  writeFile(resource: URI, content: Uint8Array): Promise<void>;
}

async function getIndexedDbFileSystemProvider(): Promise<IIndexedDBFileSystemProvider> {
  const store = "elm-package-files";
  const indexedDB = await IndexedDB.create("elm-language-server", 1, [store]);

  const mtimes = new Map<string, number>();

  let cachedFiletree: Promise<IndexedDBFileSystemNode>;
  const getFiletree = (): Promise<IndexedDBFileSystemNode> => {
    if (!cachedFiletree) {
      cachedFiletree = (async (): Promise<IndexedDBFileSystemNode> => {
        const rootNode = new IndexedDBFileSystemNode({
          children: new Map(),
          path: "",
          type: FileType.Directory,
        });
        const result = await indexedDB.runInTransaction(
          store,
          "readonly",
          (objectStore) => objectStore.getAllKeys(),
        );
        const keys = result.map((key) => key.toString());
        keys.forEach((key) => rootNode.add(key, { type: "file" }));
        return rootNode;
      })();
    }
    return cachedFiletree;
  };

  const bulkWrite = async (files: [URI, Uint8Array][]): Promise<void> => {
    files.forEach(([resource, content]) =>
      fileWriteBatch.push({ content, resource }),
    );
    await writeMany();

    const fileTree = await getFiletree();
    for (const [resource, content] of files) {
      fileTree.add(resource.path, { type: "file", size: content.byteLength });
      mtimes.set(resource.toString(), Date.now());
    }
  };

  const fileWriteBatch: { resource: URI; content: Uint8Array }[] = [];
  const writeMany = async () => {
    if (fileWriteBatch.length) {
      const fileBatch = fileWriteBatch.splice(0, fileWriteBatch.length);
      await indexedDB.runInTransaction(store, "readwrite", (objectStore) =>
        fileBatch.map((entry) => {
          return objectStore.put(entry.content, entry.resource.path);
        }),
      );
    }
  };

  return {
    async readFile(resource: URI): Promise<Uint8Array> {
      const result = await indexedDB.runInTransaction(
        store,
        "readonly",
        (objectStore) => objectStore.get(resource.path),
      );
      if (result === undefined) {
        throw new Error("File not found");
      }
      const buffer =
        result instanceof Uint8Array
          ? result
          : typeof result === "string"
          ? new TextEncoder().encode(result)
          : undefined;
      if (buffer === undefined) {
        throw Error(
          `IndexedDB entry at "${resource.path}" in unexpected format`,
        );
      }

      // update cache
      const fileTree = await getFiletree();
      fileTree.add(resource.path, { type: "file", size: buffer.byteLength });

      return buffer;
    },

    async writeFile(resource: URI, content: Uint8Array): Promise<void> {
      await bulkWrite([[resource, content]]);
    },
  };
}

enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

const enum FileChangeType {
  UPDATED,
  ADDED,
  DELETED,
}

interface IFileChange {
  readonly type: FileChangeType;
  readonly resource: URI;
}

type IndexedDBFileSystemEntry =
  | {
      path: string;
      type: FileType.Directory;
      children: Map<string, IndexedDBFileSystemNode>;
    }
  | {
      path: string;
      type: FileType.File;
      size: number | undefined;
    };

class IndexedDBFileSystemNode {
  public type: FileType;

  constructor(private entry: IndexedDBFileSystemEntry) {
    this.type = entry.type;
  }

  read(path: string): IndexedDBFileSystemEntry | undefined {
    return this.doRead(path.split("/").filter((p) => p.length));
  }

  private doRead(pathParts: string[]): IndexedDBFileSystemEntry | undefined {
    if (pathParts.length === 0) {
      return this.entry;
    }
    if (this.entry.type !== FileType.Directory) {
      throw Error(
        "Internal error reading from IndexedDBFSNode -- expected directory at " +
          this.entry.path,
      );
    }
    const next = this.entry.children.get(pathParts[0]);

    if (!next) {
      return undefined;
    }
    return next.doRead(pathParts.slice(1));
  }

  delete(path: string): void {
    const toDelete = path.split("/").filter((p) => p.length);
    if (toDelete.length === 0) {
      if (this.entry.type !== FileType.Directory) {
        throw Error(
          `Internal error deleting from IndexedDBFSNode. Expected root entry to be directory`,
        );
      }
      this.entry.children.clear();
    } else {
      return this.doDelete(toDelete, path);
    }
  }

  private doDelete(pathParts: string[], originalPath: string): void {
    if (pathParts.length === 0) {
      throw Error(
        `Internal error deleting from IndexedDBFSNode -- got no deletion path parts (encountered while deleting ${originalPath})`,
      );
    } else if (this.entry.type !== FileType.Directory) {
      throw Error(
        "Internal error deleting from IndexedDBFSNode -- expected directory at " +
          this.entry.path,
      );
    } else if (pathParts.length === 1) {
      this.entry.children.delete(pathParts[0]);
    } else {
      const next = this.entry.children.get(pathParts[0]);
      if (!next) {
        throw Error(
          "Internal error deleting from IndexedDBFSNode -- expected entry at " +
            this.entry.path +
            "/",
        );
      }
      next.doDelete(pathParts.slice(1), originalPath);
    }
  }

  add(path: string, entry: { type: "file"; size?: number } | { type: "dir" }) {
    this.doAdd(
      path.split("/").filter((p) => p.length),
      entry,
      path,
    );
  }

  private doAdd(
    pathParts: string[],
    entry: { type: "file"; size?: number } | { type: "dir" },
    originalPath: string,
  ) {
    if (pathParts.length === 0) {
      throw Error(
        `Internal error creating IndexedDBFSNode -- adding empty path (encountered while adding ${originalPath})`,
      );
    } else if (this.entry.type !== FileType.Directory) {
      throw Error(
        `Internal error creating IndexedDBFSNode -- parent is not a directory (encountered while adding ${originalPath})`,
      );
    } else if (pathParts.length === 1) {
      const next = pathParts[0];
      const existing = this.entry.children.get(next);
      if (entry.type === "dir") {
        if (existing?.entry.type === FileType.File) {
          throw Error(
            `Internal error creating IndexedDBFSNode -- overwriting file with directory: ${this.entry.path}/${next} (encountered while adding ${originalPath})`,
          );
        }
        this.entry.children.set(
          next,
          existing ??
            new IndexedDBFileSystemNode({
              type: FileType.Directory,
              path: this.entry.path + "/" + next,
              children: new Map(),
            }),
        );
      } else {
        if (existing?.entry.type === FileType.Directory) {
          throw Error(
            `Internal error creating IndexedDBFSNode -- overwriting directory with file: ${this.entry.path}/${next} (encountered while adding ${originalPath})`,
          );
        }
        this.entry.children.set(
          next,
          new IndexedDBFileSystemNode({
            type: FileType.File,
            path: this.entry.path + "/" + next,
            size: entry.size,
          }),
        );
      }
    } else if (pathParts.length > 1) {
      const next = pathParts[0];
      let childNode = this.entry.children.get(next);
      if (!childNode) {
        childNode = new IndexedDBFileSystemNode({
          children: new Map(),
          path: this.entry.path + "/" + next,
          type: FileType.Directory,
        });
        this.entry.children.set(next, childNode);
      } else if (childNode.type === FileType.File) {
        throw Error(
          `Internal error creating IndexedDBFSNode -- overwriting file entry with directory: ${this.entry.path}/${next} (encountered while adding ${originalPath})`,
        );
      }
      childNode.doAdd(pathParts.slice(1), entry, originalPath);
    }
  }

  print(indentation = "") {
    console.log(indentation + this.entry.path);
    if (this.entry.type === FileType.Directory) {
      this.entry.children.forEach((child) => child.print(indentation + " "));
    }
  }
}
