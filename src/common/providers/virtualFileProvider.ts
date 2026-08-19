import { container } from "tsyringe";
import { Connection } from "vscode-languageserver";
import { ProvideFileContentsRequest } from "../protocol.js";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher.js";
import { URI } from "vscode-uri";

export class VirtualFileProvider {
  constructor() {
    const connection = container.resolve<Connection>("Connection");
    connection.onRequest(
      ProvideFileContentsRequest,
      new ElmWorkspaceMatcher((params: { uri: string }) =>
        URI.parse(params.uri),
      ).handle(({ sourceFile }) => {
        return sourceFile.tree.rootNode.text;
      }),
    );
  }
}
