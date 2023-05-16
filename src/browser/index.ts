import {
  BrowserMessageReader,
  BrowserMessageWriter,
  ProposedFeatures,
  createConnection,
} from "vscode-languageserver/browser";
import { startCommonServer } from "../common";
import { createWebFileSystemHost } from "./fileSystem";

startLanguageServer();

export function startLanguageServer(): void {
  const messageReader = new BrowserMessageReader(self);
  const messageWriter = new BrowserMessageWriter(self);
  const connection = createConnection(
    ProposedFeatures.all,
    messageReader,
    messageWriter,
  );

  startCommonServer(connection, createWebFileSystemHost(connection));
}
