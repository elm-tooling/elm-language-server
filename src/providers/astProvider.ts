import { readFileSync } from "fs";
import { container } from "tsyringe";
import {
  DidChangeTextDocumentParams,
  DidOpenTextDocumentParams,
  VersionedTextDocumentIdentifier,
  Event,
  Emitter,
  Connection,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import Parser, { Tree, Edit, Point, SyntaxNode } from "web-tree-sitter";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { Position, Range } from "vscode-languageserver-textdocument";
import { TextDocumentEvents } from "../util/textDocumentEvents";
import { TreeUtils } from "../util/treeUtils";
import { ITreeContainer } from "../forest";
import {
  IDidChangeTextDocumentParams,
  IDidOpenTextDocumentParams,
} from "./paramsExtensions";
import { Utils } from "../util/utils";

export class ASTProvider {
  private connection: Connection;
  private parser: Parser;
  private documentEvents: TextDocumentEvents;

  private treeChangeEvent = new Emitter<{
    treeContainer: ITreeContainer;
    declaration?: SyntaxNode;
  }>();
  readonly onTreeChange: Event<{
    treeContainer: ITreeContainer;
    declaration?: SyntaxNode;
  }> = this.treeChangeEvent.event;

  private pendingRenames = new Map<string, string>();

  constructor() {
    this.parser = container.resolve("Parser");
    this.connection = container.resolve("Connection");
    this.documentEvents = container.resolve(TextDocumentEvents);

    this.documentEvents.on(
      "change",
      new ElmWorkspaceMatcher((params: DidChangeTextDocumentParams) =>
        URI.parse(params.textDocument.uri),
      ).handle(this.handleChangeTextDocument.bind(this)),
    );

    this.documentEvents.on(
      "open",
      new ElmWorkspaceMatcher((params: DidOpenTextDocumentParams) =>
        URI.parse(params.textDocument.uri),
      ).handle(this.handleChangeTextDocument.bind(this)),
    );
  }

  public addPendingRename(oldUri: string, newUri: string): void {
    this.pendingRenames.set(oldUri, newUri);
  }

  protected handleChangeTextDocument = (
    params: IDidChangeTextDocumentParams | IDidOpenTextDocumentParams,
  ): void => {
    this.connection.console.info(
      `Changed text document, going to parse it. ${params.textDocument.uri}`,
    );
    const forest = params.program.getForest(false); // Don't synchronize the forest, we are only looking at the tree
    const document: VersionedTextDocumentIdentifier = params.textDocument;

    // Source file could be undefined here
    let tree: Tree = params.sourceFile?.tree;

    if ("contentChanges" in params) {
      for (const change of params.contentChanges) {
        if ("range" in change) {
          tree?.edit(this.getEditFromChange(change, tree.rootNode.text));
        }
      }
    }

    const pendingRenameUri = this.pendingRenames.get(document.uri);
    this.pendingRenames.delete(document.uri);

    // Remove the old tree
    if (pendingRenameUri) {
      forest.removeTree(document.uri);
    }

    const newText =
      this.documentEvents.get(document.uri)?.getText() ??
      readFileSync(URI.parse(document.uri).fsPath, "utf8");

    const newTree = this.parser.parse(newText, tree);

    let changedDeclaration: SyntaxNode | undefined;

    tree
      ?.getChangedRanges(newTree)
      .map((range) => [
        tree?.rootNode.descendantForPosition(range.startPosition),
        tree?.rootNode.descendantForPosition(range.endPosition),
      ])
      .map(([startNode, endNode]) => [
        startNode
          ? TreeUtils.findParentOfType("value_declaration", startNode, true)
          : undefined,
        endNode
          ? TreeUtils.findParentOfType("value_declaration", endNode, true)
          : undefined,
      ])
      .forEach(([startNode, endNode]) => {
        if (
          startNode &&
          endNode &&
          startNode.id === endNode.id &&
          TreeUtils.getTypeAnnotation(startNode)
        ) {
          changedDeclaration = startNode;
          params.program.getTypeCache().invalidateValueDeclaration(startNode);
        }
      });

    if (!changedDeclaration) {
      params.program.getTypeCache().invalidateProject();
    }

    tree = newTree;

    if (tree) {
      const treeContainer = forest.setTree(
        pendingRenameUri ?? document.uri,
        true,
        true,
        tree,
      );

      // The workspace now needs to be synchronized
      params.program.markAsDirty();

      setImmediate(() => {
        if (tree) {
          this.treeChangeEvent.fire({
            treeContainer,
            declaration: changedDeclaration,
          });
        }
      });
    }
  };

  private getEditFromChange(
    change: { text: string; range: Range },
    text: string,
  ): Edit {
    const [startIndex, endIndex] = Utils.getIndicesFromRange(
      change.range,
      text,
    );

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
