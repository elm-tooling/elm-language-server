import { container } from "tsyringe";
import {
  DidChangeTextDocumentParams,
  IConnection,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IElmWorkspace } from "../elmWorkspace";
import { IDocumentEvents } from "../util/documentEvents";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";

export class ASTProvider {
  private connection: IConnection;

  constructor() {
    this.connection = container.resolve<IConnection>("Connection");
    const documentEvents = container.resolve<IDocumentEvents>("DocumentEvents");

    documentEvents.on(
      "change",
      new ElmWorkspaceMatcher((params: DidChangeTextDocumentParams) =>
        URI.parse(params.textDocument.uri),
      ).handlerForWorkspace(this.handleChangeTextDocument),
    );
  }

  protected handleChangeTextDocument = (
    params: DidChangeTextDocumentParams,
    elmWorkspace: IElmWorkspace,
  ): void => {
    this.connection.console.info(
      `Changed text document, going to parse it. ${params.textDocument.uri}`,
    );

    elmWorkspace
      .getForest()
      .upsertTreeAndImports(
        elmWorkspace,
        params.contentChanges[0].text,
        params.textDocument.uri,
      );
  };
}
