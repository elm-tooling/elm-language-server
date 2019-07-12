import { readFileSync } from "fs";
import Parser, { Point, SyntaxNode, Tree } from "tree-sitter";
import {
  DidChangeTextDocumentParams,
  IConnection,
  VersionedTextDocumentIdentifier,
} from "vscode-languageserver";
import { IForest } from "../forest";
import { IImports } from "../imports";
import { Position } from "../position";
import { DocumentEvents } from "../util/documentEvents";

export class ASTProvider {
  constructor(
    private connection: IConnection,
    private forest: IForest,
    events: DocumentEvents,
    private imports: IImports,
    private parser: Parser,
  ) {
    events.on("change", this.handleChangeTextDocument);
  }

  protected handleChangeTextDocument = async (
    params: DidChangeTextDocumentParams,
  ): Promise<void> => {
    this.connection.console.info(
      `Changed text document, going to parse it. ${params.textDocument.uri}`,
    );
    const document: VersionedTextDocumentIdentifier = params.textDocument;
    let tree: Tree | undefined = this.forest.getTree(document.uri);
    if (tree === undefined) {
      const fileContent: string = readFileSync(document.uri, "utf8");
      tree = this.parser.parse(fileContent);
    }

    for (const changeEvent of params.contentChanges) {
      if (changeEvent.range && changeEvent.rangeLength) {
        // range is range of the change. end is exclusive
        // rangeLength is length of text removed
        // text is new text
        const { range, rangeLength, text } = changeEvent;
        const startIndex: number = range.start.line * range.start.character;
        const oldEndIndex: number = startIndex + rangeLength - 1;
        if (tree) {
          tree.edit({
            // end index for new version of text
            newEndIndex: range.end.line * range.end.character - 1,
            // position in new doc change ended
            newEndPosition: Position.FROM_VS_POSITION(range.end).toTSPosition(),

            // end index for old version of text
            oldEndIndex,
            // position in old doc change ended.
            oldEndPosition: this.computeEndPosition(
              startIndex,
              oldEndIndex,
              tree,
            ),

            // index in old doc the change started
            startIndex,
            // position in old doc change started
            startPosition: Position.FROM_VS_POSITION(
              range.start,
            ).toTSPosition(),
          });
        }
        tree = this.parser.parse(text, tree);
      } else {
        tree = this.parser.parse(changeEvent.text, tree);
      }
    }
    if (tree) {
      this.forest.setTree(document.uri, true, true, tree);
      this.imports.updateImports(document.uri, tree, this.forest);
    }
  };

  private computeEndPosition = (
    startIndex: number,
    endIndex: number,
    tree: Tree,
  ): Point => {
    const node: SyntaxNode = tree.rootNode.descendantForIndex(
      startIndex,
      endIndex,
    );

    return node.endPosition;
  };
}
