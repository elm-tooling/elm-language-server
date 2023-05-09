import * as path from "path";

export const directorySeparator = "/";
const backslashRegExp = /\\/g;

function normalizeSlashes(path: string): string {
  return path.replace(backslashRegExp, directorySeparator);
}

export function join(...paths: string[]): string {
  return normalizeSlashes(path.join(...paths));
}

export function relative(from: string, to: string): string {
  return normalizeSlashes(path.relative(from, to));
}
