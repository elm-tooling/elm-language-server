import { readFileSync } from "fs";
import { container } from "tsyringe";
import {
  DidChangeTextDocumentParams,
  DidOpenTextDocumentParams,
  IConnection,
  VersionedTextDocumentIdentifier,
  Event,
  Emitter,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import Parser, { Tree, Edit, Point } from "web-tree-sitter";
import { IElmWorkspace } from "../elmWorkspace";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { Position, Range } from "vscode-languageserver-textdocument";
import { FileEventsHandler } from "./handlers/fileEventsHandler";
import { TextDocumentEvents } from "../util/textDocumentEvents";
import { TreeUtils } from "../util/treeUtils";

export class ASTProvider {
  private connection: IConnection;
  private parser: Parser;
  private documentEvents: TextDocumentEvents;

  private treeChangeEvent = new Emitter<{ uri: string; tree: Tree }>();
  readonly onTreeChange: Event<{ uri: string; tree: Tree }> = this
    .treeChangeEvent.event;

  constructor() {
    this.parser = container.resolve("Parser");
    this.connection = container.resolve<IConnection>("Connection");
    this.documentEvents = container.resolve<TextDocumentEvents>(
      TextDocumentEvents,
    );

    new FileEventsHandler();

    this.documentEvents.on(
      "change",
      new ElmWorkspaceMatcher((params: DidChangeTextDocumentParams) =>
        URI.parse(params.textDocument.uri),
      ).handlerForWorkspace(this.handleChangeTextDocument),
    );

    this.documentEvents.on(
      "open",
      new ElmWorkspaceMatcher((params: DidOpenTextDocumentParams) =>
        URI.parse(params.textDocument.uri),
      ).handlerForWorkspace(this.handleChangeTextDocument),
    );
  }

  protected handleChangeTextDocument = (
    params: DidChangeTextDocumentParams | DidOpenTextDocumentParams,
    elmWorkspace: IElmWorkspace,
  ): void => {
    this.connection.console.info(
      `Changed text document, going to parse it. ${params.textDocument.uri}`,
    );
    const forest = elmWorkspace.getForest();
    const imports = elmWorkspace.getImports();
    const document: VersionedTextDocumentIdentifier = params.textDocument;

    let tree: Tree | undefined = forest.getTree(document.uri);

    if ("contentChanges" in params) {
      for (const change of params.contentChanges) {
        if ("range" in change) {
          tree?.edit(this.getEditFromChange(change, tree.rootNode.text));
        }
      }
    }

    const newText =
      this.documentEvents.get(params.textDocument.uri)?.getText() ??
      readFileSync(URI.parse(document.uri).fsPath, "utf8");

    const newTree = this.parser.parse(newText, tree);

    tree
      ?.getChangedRanges(newTree)
      .map((range) => [
        tree?.rootNode.descendantForPosition(range.startPosition),
        tree?.rootNode.descendantForPosition(range.endPosition),
      ])
      .map(([startNode, endNode]) => [
        startNode
          ? TreeUtils.findParentOfType("value_declaration", startNode)
          : undefined,
        endNode
          ? TreeUtils.findParentOfType("value_declaration", endNode)
          : undefined,
      ])
      .forEach(([startNode, endNode]) => {
        if (
          startNode &&
          endNode &&
          startNode.id === endNode.id &&
          TreeUtils.getTypeAnnotation(startNode)
        ) {
          elmWorkspace.getTypeCache().invalidateValueDeclaration(startNode);
        } else {
          elmWorkspace.getTypeCache().invalidateProject();
        }
      });

    tree = newTree;

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

      this.treeChangeEvent.fire({ uri: document.uri, tree });
    }
  };

  private getEditFromChange(
    change: { text: string; range: Range },
    text: string,
  ): Edit {
    const [startIndex, endIndex] = this.getIndexesFromRange(change.range, text);

    return {
      startIndex,
      oldEndIndex: endIndex,
      newEndIndex: startIndex + change.text.length,
      startPosition: this.toTSPoint(change.range.start),
      oldEndPosition: this.toTSPoint(change.range.end),
      newEndPosition: this.toTSPoint(
        this.addPositions(change.range.start, this.textToPosition(change.text)),
      ),
    };
  }

  private textToPosition(text: string): Position {
    const lines = text.split(/\r\n|\r|\n/);

    return {
      line: lines.length - 1,
      character: lines[lines.length - 1].length,
    };
  }

  private getIndexesFromRange(range: Range, text: string): [number, number] {
    let startIndex = range.start.character;
    let endIndex = range.end.character;

    const regex = new RegExp(/\r\n|\r|\n/);
    const eolResult = regex.exec(text);

    const lines = text.split(regex);
    const eol = eolResult && eolResult.length > 0 ? eolResult[0] : "";

    for (let i = 0; i < range.end.line; i++) {
      if (i < range.start.line) {
        startIndex += lines[i].length + eol.length;
      }
      endIndex += lines[i].length + eol.length;
    }

    return [startIndex, endIndex];
  }

  private addPositions(pos1: Position, pos2: Position): Position {
    return {
      line: pos1.line + pos2.line,
      character: pos1.character + pos2.character,
    };
  }

  private toTSPoint(position: Position): Point {
    return { row: position.line, column: position.character };
  }
}
