import {
  DocumentFormattingParams,
  IConnection,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import * as Diff from "../util/diff";
import { execCmd } from "../util/elmUtils";
import { Settings } from "../util/settings";
import { TextDocumentEvents } from "../util/textDocumentEvents";

export class DocumentFormattingProvider {
  constructor(
    private connection: IConnection,
    private elmWorkspaceFolder: URI,
    private events: TextDocumentEvents,
    private settings: Settings,
  ) {
    this.connection.onDocumentFormatting(this.handleFormattingRequest);
  }

  public formatText = async (
    elmFormatPath: string,
    text: string,
  ): Promise<TextEdit[] | undefined> => {
    const options = {
      cmdArguments: ["--stdin", "--elm-version", "0.19", "--yes"],
      notFoundText: "Install elm-format via 'npm install -g elm-format",
    };

    try {
      const format = await execCmd(
        elmFormatPath,
        "elm-format",
        options,
        this.elmWorkspaceFolder.fsPath,
        this.connection,
        text,
      );
      return Diff.getTextRangeChanges(text, format.stdout);
    } catch (error) {
      this.connection.console.warn(JSON.stringify(error));
    }
  };

  protected handleFormattingRequest = async (
    params: DocumentFormattingParams,
  ) => {
    this.connection.console.info(`Formatting was requested`);
    try {
      const text = this.events.get(params.textDocument.uri);
      if (!text) {
        this.connection.console.error("Can't find file for formatting.");
        return;
      }

      const settings = await this.settings.getClientSettings();
      return await this.formatText(settings.elmFormatPath, text.getText());
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
}
