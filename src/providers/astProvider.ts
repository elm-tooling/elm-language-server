import { readFileSync } from "fs";

import {
  DidChangeTextDocumentParams,
  IConnection,
  VersionedTextDocumentIdentifier,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import Parser, { Point, SyntaxNode, Tree } from "web-tree-sitter";
import { ElmWorkspace } from "../elmWorkspace";
import { IDocumentEvents } from "../util/documentEvents";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";

export class ASTProvider {
  constructor(
    private connection: IConnection,
    elmWorkspaces: ElmWorkspace[],
    documentEvents: IDocumentEvents,
    private parser: Parser,
  ) {
    documentEvents.on(
      "change",
      new ElmWorkspaceMatcher(
        elmWorkspaces,
        (params: DidChangeTextDocumentParams) =>
          URI.parse(params.textDocument.uri),
      ).handlerForWorkspace(this.handleChangeTextDocument),
    );
  }

  protected handleChangeTextDocument = async (
    params: DidChangeTextDocumentParams,
    elmWorkspace: ElmWorkspace,
  ): Promise<void> => {
    this.connection.console.info(
      `Changed text document, going to parse it. ${params.textDocument.uri}`,
    );
    const forest = elmWorkspace.getForest();
    const imports = elmWorkspace.getImports();
    const document: VersionedTextDocumentIdentifier = params.textDocument;

    let tree: Tree | undefined = forest.getTree(document.uri);
    if (tree === undefined) {
      const fileContent: string = readFileSync(
        URI.parse(document.uri).fsPath,
        "utf8",
      );
      tree = this.parser.parse(fileContent);
    }

    for (const changeEvent of params.contentChanges) {
      tree = this.parser.parse(changeEvent.text);
    }
    if (tree) {
      forest.setTree(document.uri, true, true, tree);
      imports.updateImports(document.uri, tree, forest);
    }
  };
}
