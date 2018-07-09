import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode-languageserver';

export const isWindows = process.platform === 'win32';

/** Options for execCmd */
export interface ExecCmdOptions {
  /** The project root folder for this file is used as the cwd of the process */
  fileName?: string;
  /** Any arguments */
  cmdArguments?: string[];
  /** Shows a message if an error occurs (in particular the command not being */
  /* found), instead of rejecting. If this happens, the promise never resolves */
  showMessageOnError?: boolean;
  /** Called after the process successfully starts */
  onStart?: () => void;
  /** Called when data is sent to stdout */
  onStdout?: (data: string) => void;
  /** Called when data is sent to stderr */
  onStderr?: (data: string) => void;
  /** Called after the command (successfully or unsuccessfully) exits */
  onExit?: () => void;
  /** Text to add when command is not found (maybe helping how to install) */
  notFoundText?: string;
}


export function findProj(dir: string): string {
  if (fs.lstatSync(dir).isDirectory()) {
    const files = fs.readdirSync(dir);
    const file = files.find((v, i) => v === 'elm-package.json');
    if (file !== undefined) {
      return dir + path.sep + file;
    }
    let parent = '';
    if (dir.lastIndexOf(path.sep) > 0) {
      parent = dir.substr(0, dir.lastIndexOf(path.sep));
    }
    if (parent === '') {
      return '';
    } else {
      return findProj(parent);
    }
  }
}

export function detectProjectRoot(fileName: string): string {
  const proj = findProj(path.dirname(fileName));
  if (proj !== '') {
    return path.dirname(proj);
  }
  return undefined;
}

export function getIndicesOf(searchStr: string, str: string): number[] {
  let startIndex = 0,
    searchStrLen = searchStr.length;
  let index,
    indices = [];
  while ((index = str.indexOf(searchStr, startIndex)) > -1) {
    indices.push(index);
    startIndex = index + searchStrLen;
  }
  return indices;
}
