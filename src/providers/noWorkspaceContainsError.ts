import { URI } from "vscode-uri";

export class NoWorkspaceContainsError extends Error {
  constructor(uri: URI) {
    super(`No Elm workspace contains ${uri.fsPath}`);
  }
}
