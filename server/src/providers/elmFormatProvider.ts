import * as diff from "fast-diff";
import * as fs from "fs";
import {
  DocumentFormattingParams,
  IConnection,
  Range,
  TextEdit,
} from "vscode-languageserver";
import URI from "vscode-uri";
import { execCmd } from "../util/elmUtils";

export class ElmFormatProvider {
  private connection: IConnection;
  private elmWorkspaceFolder: URI;

  constructor(connection: IConnection, elmWorkspaceFolder: URI) {
    this.connection = connection;
    this.elmWorkspaceFolder = elmWorkspaceFolder;

    this.connection.onDocumentFormatting(this.handleFormattingRequest);
  }

  protected handleFormattingRequest = async (
    params: DocumentFormattingParams,
  ) => {
    try {
      const text = fs.readFileSync(URI.parse(params.textDocument.uri).fsPath);
      const options = {
        cmdArguments: ["--stdin", "--elm-version 0.19", "--yes"],
        notFoundText:
          "Install Elm-format from https://github.com/avh4/elm-format",
      };
      const format = execCmd(
        "elm-format",
        options,
        this.elmWorkspaceFolder,
        this.connection,
      );

      format.stdin.write(text);
      format.stdin.end();

      const stdout = await format;

      const ranges = this.getTextRangeChanges(text.toString(), stdout.stdout);

      return ranges;
    } catch (error) {
      const message = (error.message as string).includes("SYNTAX PROBLEM")
        ? "Running elm-format failed. Check the file for syntax errors."
        : "Running elm-format failed. Install from " +
          "https://github.com/avh4/elm-format and make sure it's on your path";
      this.connection.console.error(message);
    }
  };

  // Given two strings (`before`, `after`), return a list of all substrings
  // that appear in `after` but not in `before`, and the positions of each
  // of the substrings within `after`.
  private getTextRangeChanges(before: string, after: string) {
    const newRanges: TextEdit[] = [];
    let lineNumber = 0;
    let column = 0;

    const parts = diff(before, after);

    // Loop over every part, keeping track of:
    // 1. The current line no. and column in the `after` string
    // 2. Character ranges for all "added" parts in the `after` string
    parts.forEach(part => {
      const startLineNumber = lineNumber;
      const startColumn = column;
      if (part[0] === 0 || part[0] === -1) {
        // Split the part into lines. Loop through these lines to find
        // the line no. and column at the end of this part.
        const substring = part[1];
        const lines = substring.split("\n");
        lines.forEach((line, lineIndex) => {
          // The first `line` is actually just a continuation of the last line
          if (lineIndex === 0) {
            column += line.length;
            // All other lines come after a line break.
          } else if (lineIndex > 0) {
            lineNumber += 1;
            column = line.length;
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
    return newRanges;
  }
}
