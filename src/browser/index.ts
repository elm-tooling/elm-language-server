import {
  BrowserMessageReader,
  BrowserMessageWriter,
  ProposedFeatures,
  createConnection,
} from "vscode-languageserver/browser";
import { startCommonServer } from "../common/index.js";
import { createWebFileSystemHost } from "./fileSystem.js";

startLanguageServer();

export function startLanguageServer(): void {
  const messageReader = new BrowserMessageReader(self);
  const messageWriter = new BrowserMessageWriter(self);
  const connection = createConnection(
    ProposedFeatures.all,
    messageReader,
    messageWriter,
  );

  startCommonServer(
    connection,
    createWebFileSystemHost(connection),
    "/tree-sitter-elm.wasm",
  );
}
