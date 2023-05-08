import * as Path from "path";
import "reflect-metadata";
import { container } from "tsyringe"; //must be after reflect-metadata
import {
  Connection,
  InitializeParams,
  InitializeResult,
} from "vscode-languageserver";

import Parser from "web-tree-sitter";
import { CapabilityCalculator } from "./capabilityCalculator";
import { ASTProvider } from "./providers";
import {
  ElmAnalyseJsonService,
  IElmAnalyseJsonService,
} from "./providers/diagnostics/elmAnalyseJsonService";
import { ILanguageServer } from "./server";
import { DocumentEvents } from "./util/documentEvents";
import { IClientSettings, Settings } from "./util/settings";
import { TextDocumentEvents } from "./util/textDocumentEvents";
import { IFileSystemHost } from "./types";
import { URI, Utils } from "vscode-uri";

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
      await Parser.init();
      const absolute = Path.join(__dirname, "tree-sitter-elm.wasm");
      const pathToWasm = Path.relative(process.cwd(), absolute);
      connection.console.info(
        `Loading Elm tree-sitter syntax from ${pathToWasm}`,
      );
      const language = await Parser.Language.load(pathToWasm);
      const parser = container.resolve<Parser>("Parser");
      // const logger: Parser.Logger = (
      //   message: string,
      //   params: { [param: string]: string },
      //   isLexMessage: "lex" | "parse",
      // ) => {
      //   let type = isLexMessage ? "lex" : "parse";
      //   if (type === "lex") type += "  ";
      //   connection.console.info(`${type} ${message}`);
      // };
      // parser.setLogger(logger);
      parser.setLanguage(language);

      container.register(CapabilityCalculator, {
        useValue: new CapabilityCalculator(params.capabilities),
      });

      const initializationOptions: IClientSettings =
        params.initializationOptions ?? {};

      container.register("Settings", {
        useValue: new Settings(initializationOptions, params.capabilities),
      });

      const { Server } = await import("./server");

      server = new Server(params, fileSystemHost);

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

  // Listen on the connection
  connection.listen();

  // Don't die on unhandled Promise rejections
  process.on("unhandledRejection", (reason, p) => {
    connection.console.error(
      `Unhandled Rejection at: Promise ${p} reason:, ${reason}`,
    );
  });
}

const elmPackageRoot = URI.parse("https://raw.githubusercontent.com");
export function convertToFileSystemUri(uri: URI): URI {
  if (isVirtualPackageFile(uri)) {
    return Utils.joinPath(elmPackageRoot, uri.path);
  }

  return uri;
}

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
