import { container } from "tsyringe";
import { Connection } from "vscode-languageserver";
import { ProvideFileContentsRequest } from "../protocol.js";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher.js";
import { URI } from "vscode-uri";
import { Settings } from "../util/settings.js";

export class VirtualFileProvider {
  constructor() {
    const connection = container.resolve<Connection>("Connection");
    const settings = container.resolve<Settings>("Settings");
    const provideContent = new ElmWorkspaceMatcher((params: { uri: string }) =>
      URI.parse(params.uri),
    ).handle(({ sourceFile }) => sourceFile.tree.rootNode.text);

    // TODO: Remove this custom request after Elm clients migrate to LSP 3.18.
    connection.onRequest(ProvideFileContentsRequest, provideContent);

    if (settings.isTextDocumentContentSupported()) {
      connection.workspace.textDocumentContent.on(async (params, token) => ({
        text: await provideContent(params, token),
      }));
    }
  }
}
