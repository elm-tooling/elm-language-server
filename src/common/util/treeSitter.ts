import { Edit, ParseCallback, Parser, Point, Tree } from "web-tree-sitter";
import {
  Position,
  Range,
  TextDocumentContentChangeEvent,
} from "vscode-languageserver-textdocument";
import { Utils } from "./utils";

export function parseOrThrow(
  parser: Parser,
  input: string | ParseCallback,
  oldTree?: Tree | null,
): Tree {
  const tree = parser.parse(input, oldTree);
  if (!tree) {
    throw new Error(
      "Tree-sitter parsing failed because the parser has no language or parsing was cancelled.",
    );
  }

  return tree;
}

export function applyChangesToTree(
  tree: Tree,
  changes: TextDocumentContentChangeEvent[],
): void {
  let text = tree.rootNode.text;

  const multipleChanges = changes.length > 1;
  for (const change of changes) {
    const changeRecord = getChangeWithRange(change, text);
    const edit = getEditFromChange(changeRecord, text);
    tree.edit(edit);

    if (multipleChanges) {
      text =
        text.substring(0, edit.startIndex) +
        change.text +
        text.substring(edit.oldEndIndex);
    }
  }
}

function getChangeWithRange(
  change: TextDocumentContentChangeEvent,
  text: string,
): { text: string; range: Range } {
  if ("range" in change) {
    return change;
  }

  return {
    text: change.text,
    range: {
      start: { line: 0, character: 0 },
      end: textToPosition(text),
    },
  };
}

function getEditFromChange(
  change: { text: string; range: Range },
  text: string,
): Edit {
  const [startIndex, endIndex] = Utils.getIndicesFromRange(change.range, text);

  return new Edit({
    startIndex,
    oldEndIndex: endIndex,
    newEndIndex: startIndex + change.text.length,
    startPosition: toTSPoint(change.range.start),
    oldEndPosition: toTSPoint(change.range.end),
    newEndPosition: toTSPoint(
      addPositions(change.range.start, textToPosition(change.text)),
    ),
  });
}

function textToPosition(text: string): Position {
  const lines = text.split(/\r\n|\r|\n/);
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1].length,
  };
}

function addPositions(pos1: Position, pos2: Position): Position {
  return {
    line: pos1.line + pos2.line,
    character:
      pos2.line === 0 ? pos1.character + pos2.character : pos2.character,
  };
}

function toTSPoint(position: Position): Point {
  return { row: position.line, column: position.character };
}
