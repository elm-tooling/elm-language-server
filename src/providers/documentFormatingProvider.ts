import {
  DocumentFormattingParams,
  IConnection,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IElmWorkspace, ElmWorkspace } from "../elmWorkspace";
import * as Diff from "../util/diff";
import { execCmd } from "../util/elmUtils";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { Settings } from "../util/settings";
import { TextDocumentEvents } from "../util/textDocumentEvents";
import { DependencyContainer, injectable } from "tsyringe";

type DocumentFormattingResult = Promise<TextEdit[] | undefined>;

@injectable()
export class DocumentFormattingProvider {
  private events: TextDocumentEvents;
  private connection: IConnection;
  private settings: Settings;

  constructor(workspaceChildContainer: DependencyContainer) {
    const elmWorkspaces = workspaceChildContainer.resolve<IElmWorkspace[]>(
      "ElmWorkspaces",
    );
    this.settings = workspaceChildContainer.resolve<Settings>("Settings");
    this.connection = workspaceChildContainer.resolve<IConnection>(
      "Connection",
    );
    this.events = workspaceChildContainer.resolve<TextDocumentEvents>(
      TextDocumentEvents,
    );
    this.connection.onDocumentFormatting(
      new ElmWorkspaceMatcher(
        elmWorkspaces,
        (params: DocumentFormattingParams) =>
          URI.parse(params.textDocument.uri),
      ).handlerForWorkspace(this.handleFormattingRequest),
    );
  }

  public formatText = async (
    elmWorkspaceRootPath: URI,
    elmFormatPath: string,
    text: string,
  ): DocumentFormattingResult => {
    const options = {
      cmdArguments: ["--stdin", "--elm-version", "0.19", "--yes"],
      notFoundText: "Install elm-format via 'npm install -g elm-format",
    };

    try {
      const format = await execCmd(
        elmFormatPath,
        "elm-format",
        options,
        elmWorkspaceRootPath.fsPath,
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
    elmWorkspace: IElmWorkspace,
  ): DocumentFormattingResult => {
    this.connection.console.info(`Formatting was requested`);
    try {
      const text = this.events.get(params.textDocument.uri);
      if (!text) {
        this.connection.console.error("Can't find file for formatting.");
        return;
      }

      const settings = await this.settings.getClientSettings();
      return await this.formatText(
        elmWorkspace.getRootPath(),
        settings.elmFormatPath,
        text.getText(),
      );
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
