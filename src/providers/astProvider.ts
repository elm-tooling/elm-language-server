import { readFileSync } from "fs";
import { container } from "tsyringe";
import {
  DidChangeTextDocumentParams,
  IConnection,
  VersionedTextDocumentIdentifier,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import Parser, { Tree } from "web-tree-sitter";
import { IElmWorkspace } from "../elmWorkspace";
import { IDocumentEvents } from "../util/documentEvents";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";

export class ASTProvider {
  private connection: IConnection;
  private parser: Parser;

  constructor() {
    const elmWorkspaces = container.resolve<IElmWorkspace[]>("ElmWorkspaces");
    this.parser = container.resolve("Parser");
    this.connection = container.resolve<IConnection>("Connection");
    const documentEvents = container.resolve<IDocumentEvents>("DocumentEvents");

    documentEvents.on(
      "change",
      new ElmWorkspaceMatcher(
        elmWorkspaces,
        (params: DidChangeTextDocumentParams) =>
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
      forest.setTree(document.uri, true, true, tree, true);

      // Figure out if we have files importing our changed file - update them
      const urisToRefresh = [];
      for (const uri in imports.imports) {
        if (imports.imports.hasOwnProperty(uri)) {
          const fileImports = imports.imports[uri];

          if (fileImports.some((a) => a.fromUri === document.uri)) {
            urisToRefresh.push(uri);
          }
        }
      }
      urisToRefresh.forEach((a) => {
        imports.updateImports(a, forest.getTree(a)!, forest);
      });

      // Refresh imports of the calling file
      imports.updateImports(document.uri, tree, forest);
    }
  };
}
