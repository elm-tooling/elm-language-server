import diff from "fast-diff";
import {
  DocumentFormattingParams,
  IConnection,
  Range,
  TextEdit,
} from "vscode-languageserver";
import URI from "vscode-uri";
import { DocumentEvents } from "../util/documentEvents";
import { execCmd } from "../util/elmUtils";
import { Settings } from "../util/settings";
import { TextDocumentEvents } from "../util/textDocumentEvents";

export class ElmFormatProvider {
  private events: TextDocumentEvents;

  constructor(
    private connection: IConnection,
    private elmWorkspaceFolder: URI,
    documentEvents: DocumentEvents,
  ) {
    this.connection = connection;
    this.elmWorkspaceFolder = elmWorkspaceFolder;
    this.events = new TextDocumentEvents(documentEvents);

    this.connection.onDocumentFormatting(this.handleFormattingRequest);
  }

  protected handleFormattingRequest = async (
    params: DocumentFormattingParams,
  ) => {
    try {
      const settings = await Settings.getSettings(this.connection);
      const text = this.events.get(params.textDocument.uri);
      if (!text) {
        this.connection.console.error("Can't find file for formatting.");
        return;
      }

      const options = {
        cmdArguments: ["--stdin", "--elm-version 0.19", "--yes"],
        notFoundText: "Install Elm-format via 'npm install -g elm-format",
      };
      const format = execCmd(
        settings.elmFormatPath,
        options,
        this.elmWorkspaceFolder,
        this.connection,
      );

      format.stdin.write(text.getText());
      format.stdin.end();

      const stdout = await format;

      const ranges = this.getTextRangeChanges(text.toString(), stdout.stdout);

      return ranges;
    } catch (error) {
      (error.message as string).includes("SYNTAX PROBLEM")
        ? this.connection.console.error(
            "Running elm-format failed. Check the file for syntax errors.",
          )
        : this.connection.window.showErrorMessage(
            "Running elm-format failed. Install via " +
              "'npm install -g elm-format' and make sure it's on your path",
          );
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
