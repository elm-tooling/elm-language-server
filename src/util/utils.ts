import { Range } from "vscode-languageserver";

export class Utils {
  public static notUndefined<T>(x: T | undefined): x is T {
    return x !== undefined;
  }

  public static notUndefinedOrNull<T>(x: T | undefined | null): x is T {
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
}
