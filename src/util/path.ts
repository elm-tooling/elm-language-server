import { URI } from "vscode-uri";

import * as path from "path";

export const directorySeparator = "/";
const backslashRegExp = /\\/g;

export function normalizeSlashes(path: string): string {
  return path.replace(backslashRegExp, directorySeparator);
}

export function normalizeUri(uri: string): string {
  return normalizeSlashes(URI.file(uri).fsPath);
}

export function join(...paths: string[]): string {
  return normalizeSlashes(path.join(...paths));
}

export function relative(from: string, to: string): string {
  return normalizeSlashes(path.relative(from, to));
}

export function resolve(...pathSegments: string[]): string {
  return normalizeSlashes(path.resolve(...pathSegments));
}
