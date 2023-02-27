import diff from "fast-diff";
import { Connection, Range, TextEdit } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { execCmdSync } from "../compiler/utils/elmUtils";
// Given two strings (`before`, `after`), return a list of all substrings
// that appear in `after` but not in `before`, and the positions of each
// of the substrings within `after`.
function getTextRangeChanges(
  before: string,
  after: string,
): Promise<TextEdit[]> {
  const newRanges: TextEdit[] = [];
  let lineNumber = 0;
  let column = 0;

  const parts = diff(before, after);

  // Loop over every part, keeping track of:
  // 1. The current line no. and column in the `after` string
  // 2. Character ranges for all "added" parts in the `after` string
  parts.forEach((part) => {
    const startLineNumber = lineNumber;
    const startColumn = column;
    if (part[0] === 0 || part[0] === -1) {
      // Split the part into lines. Loop through these lines to find
      // the line no. and column at the end of this part.
      const lines = part[1].split("\n").map((a) => a.length);
      lines.forEach((lineLength, lineIndex) => {
        // The first `line` is actually just a continuation of the last line
        if (lineIndex === 0) {
          column += lineLength;
          // All other lines come after a line break.
        } else if (lineIndex > 0) {
          lineNumber += 1;
          column = lineLength;
        }
      });
    }

    if (part[0] === 1) {
      newRanges.push({
        newText: part[1],
        range: Range.create(
          startLineNumber,
          startColumn,
          startLineNumber,
          startColumn,
        ),
      });
    } else if (part[0] === -1) {
      newRanges.push({
        newText: "",
        range: Range.create(startLineNumber, startColumn, lineNumber, column),
      });
    }
  });
  return Promise.resolve(newRanges);
}

export function formatText(
  elmWorkspaceRootPath: URI,
  elmFormatPath: string,
  text: string,
  connection: Connection,
): Promise<TextEdit[]> {
  const options = {
    cmdArguments: ["--stdin", "--elm-version", "0.19", "--yes"],
    notFoundText: "Install elm-format via 'npm install -g elm-format'.",
  };

  const format = execCmdSync(
    elmFormatPath,
    "elm-format",
    options,
    elmWorkspaceRootPath.fsPath,
    connection,
    text,
  );
  return getTextRangeChanges(text, format.stdout);
}
