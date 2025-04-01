import * as Path from "path";
import "reflect-metadata";
import { container } from "tsyringe"; //must be after reflect-metadata
import {
  Connection,
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver";

import { Parser, Language } from "web-tree-sitter";
import { CapabilityCalculator } from "./capabilityCalculator";
import { ASTProvider } from "./providers";
import {
  ElmAnalyseJsonService,
  IElmAnalyseJsonService,
} from "./providers/diagnostics/elmAnalyseJsonService";
import { ILanguageServer } from "./server";
import { DocumentEvents } from "./util/documentEvents";
import { Settings } from "./util/settings";
import { TextDocumentEvents } from "./util/textDocumentEvents";
import { IFileSystemHost, InitializationOptions } from "./types";
import { URI, Utils } from "vscode-uri";
import { outDir } from "../directories";

export function startCommonServer(
  connection: Connection,
  fileSystemHost: IFileSystemHost,
): void {
  // Composition root - be aware, there are some register calls that need to be done later
  container.register<Connection>("Connection", {
    useValue: connection,
  });
  container.registerSingleton<Parser>("Parser", Parser);

  container.registerSingleton("DocumentEvents", DocumentEvents);
  container.registerSingleton<IElmAnalyseJsonService>(
    "ElmAnalyseJsonService",
    ElmAnalyseJsonService,
  );
  container.register(TextDocumentEvents, {
    useValue: new TextDocumentEvents(),
  });

  let server: ILanguageServer;
  let initSuccessfull = false;

  connection.onInitialize(
    async (params: InitializeParams): Promise<InitializeResult> => {
      const initializationOptions =
        <InitializationOptions>params.initializationOptions ?? {};

      const options: object | undefined =
        initializationOptions.treeSitterWasmUri
          ? {
              locateFile(): string | undefined {
                return initializationOptions.treeSitterWasmUri;
              },
            }
          : undefined;
      await Parser.init(options);
      const pathToWasm =
        initializationOptions.treeSitterElmWasmUri ??
        Path.relative(process.cwd(), Path.join(outDir, "tree-sitter-elm.wasm"));
      connection.console.info(
        `Loading Elm tree-sitter syntax from ${pathToWasm}`,
      );
      const language = await Language.load(pathToWasm);
      const parser = container.resolve<Parser>("Parser");
      parser.setLanguage(language);

      container.register(CapabilityCalculator, {
        useValue: new CapabilityCalculator(params.capabilities),
      });

      container.register("Settings", {
        useValue: new Settings(initializationOptions, params.capabilities),
      });

      const { Server } = await import("./server");

      server = new Server(params, fileSystemHost, initializationOptions);

      initSuccessfull = server.initSuccessfull.valueOf();

      if (!initSuccessfull) {
        connection.console.info("Server initialization failed");
        return {
          capabilities: {},
        };
      }

      container.register(ASTProvider, {
        useValue: new ASTProvider(),
      });

      return server.capabilities;
    },
  );

  connection.onInitialized(() => {
    if (initSuccessfull) {
      server.registerInitializedProviders();
      void server.init();
    }
  });

  connection.onExit(() => {
    server.dispose();
  });

  // Listen on the connection
  connection.listen();
}

const elmPackageRoot = URI.parse("https://raw.githubusercontent.com");
export function convertToFileSystemUri(uri: URI): URI {
  if (isVirtualPackageFile(uri)) {
    return Utils.joinPath(elmPackageRoot, uri.path);
  }

  return uri;
}

export const virtualPackagesRoot = URI.parse("elm-virtual-file://package/");

export function isVirtualPackageFile(uri: URI): boolean {
  return uri.scheme === "elm-virtual-file" && uri.authority === "package";
}

export async function readFileWithCachedVirtualPackageFile(
  uri: URI,
  readFile: (uri: URI) => Promise<string>,
  virtualPackageCache: {
    getVirtualPackageRoot: () => URI;
    get: (uri: URI) => Promise<string | undefined>;
    set: (uri: URI, value: string) => Promise<void>;
  },
): Promise<string> {
  if (isVirtualPackageFile(uri)) {
    const virtualPackageUri = Utils.joinPath(
      virtualPackageCache.getVirtualPackageRoot(),
      uri.path,
    );
    const cached = await virtualPackageCache.get(virtualPackageUri);

    if (cached) {
      return cached;
    }

    const result = await readFile(convertToFileSystemUri(uri));
    await virtualPackageCache.set(virtualPackageUri, result);
    return result;
  } else {
    return await readFile(convertToFileSystemUri(uri));
  }
}
