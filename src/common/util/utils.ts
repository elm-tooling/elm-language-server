import { Position, Range, TextEdit } from "vscode-languageserver";
import { SyntaxNode } from "web-tree-sitter";

export type NonEmptyArray<T> = [T, ...T[]];

export class Utils {
  public static notUndefined<T>(this: void, x: T | undefined): x is T {
    return x !== undefined;
  }

  public static notUndefinedOrNull<T>(
    this: void,
    x: T | undefined | null,
  ): x is T {
    return x !== undefined && x !== null;
  }

  public static arrayEquals<T>(
    a: T[],
    b: T[],
    itemEquals: (a: T, b: T) => boolean = (a, b): boolean => a === b,
  ): boolean {
    if (a === b) {
      return true;
    }
    if (a.length !== b.length) {
      return false;
    }
    return a.every((x, i) => itemEquals(x, b[i]));
  }

  public static rangeEquals(a: Range, b: Range): boolean {
    return (
      a.start.character === b.start.character &&
      a.start.line === b.start.line &&
      a.end.character === b.end.character &&
      a.end.line === b.end.line
    );
  }

  public static rangeOverlaps(a: Range, b: Range): boolean {
    if (b.start.line < a.start.line || b.end.line < a.start.line) {
      return false;
    }
    if (b.start.line > a.end.line || b.end.line > a.end.line) {
      return false;
    }
    if (
      b.start.line === a.start.line &&
      b.start.character < a.start.character
    ) {
      return false;
    }
    if (b.end.line === a.end.line && b.end.character > a.end.character) {
      return false;
    }
    return true;
  }

  public static getIndicesFromRange(
    range: Range,
    text: string,
  ): [number, number] {
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

  public static rangeFromNode(node: SyntaxNode): Range {
    return Range.create(
      Position.create(node.startPosition.row, node.startPosition.column),
      Position.create(node.endPosition.row, node.endPosition.column),
    );
  }

  public static rotateArray<T>(array: T[], newStartIndex: number): T[] {
    const newArray = [];
    for (let i = 0; i < array.length; i++) {
      newArray.push(array[newStartIndex]);
      newStartIndex = (newStartIndex + 1) % array.length;
    }
    return newArray;
  }

  public static mergeChanges(
    a: { [uri: string]: TextEdit[] },
    b: { [uri: string]: TextEdit[] },
  ): void {
    Object.entries(b).forEach(([uri, edits]) => {
      if (a[uri]) {
        a[uri].push(...edits);
      } else {
        a[uri] = edits;
      }
    });
  }
}
