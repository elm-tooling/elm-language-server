import { container, injectable } from "tsyringe";
import {
  DocumentFormattingParams,
  Connection,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { DiagnosticsProvider } from ".";
import { formatText } from "../util/diff";
import { ElmWorkspaceMatcher } from "../util/elmWorkspaceMatcher";
import { Settings } from "../util/settings";
import { TextDocumentEvents } from "../util/textDocumentEvents";
import { IDocumentFormattingParams } from "./paramsExtensions";

type DocumentFormattingResult = Promise<TextEdit[] | undefined>;

@injectable()
export class DocumentFormattingProvider {
  private events: TextDocumentEvents;
  private connection: Connection;
  private settings: Settings;
  private diagnostics: DiagnosticsProvider;

  constructor() {
    this.settings = container.resolve<Settings>("Settings");
    this.connection = container.resolve<Connection>("Connection");
    this.events = container.resolve<TextDocumentEvents>(TextDocumentEvents);
    this.diagnostics = container.resolve(DiagnosticsProvider);
    this.connection.onDocumentFormatting(
      this.diagnostics.interruptDiagnostics(() =>
        new ElmWorkspaceMatcher((params: DocumentFormattingParams) =>
          URI.parse(params.textDocument.uri),
        ).handle(this.handleFormattingRequest),
      ),
    );
  }

  protected handleFormattingRequest = async (
    params: IDocumentFormattingParams,
  ): DocumentFormattingResult => {
    this.connection.console.info(`Formatting was requested`);
    try {
      const text = this.events.get(params.textDocument.uri);
      if (!text) {
        this.connection.console.error("Can't find file for formatting.");
        return;
      }

      const settings = await this.settings.getClientSettings();
      return formatText(
        params.program.getRootPath(),
        settings.elmFormatPath,
        text.getText(),
        this.connection,
      );
    } catch (error) {
      this.connection.console.warn(JSON.stringify(error));
      if (
        error instanceof Error &&
        error?.message &&
        (error.message.includes("SYNTAX PROBLEM") || //Elm-format 0.8.4 and below
          error.message.includes("Unable to parse file")) //Elm-format 0.8.5 and above
      ) {
        this.connection.window.showErrorMessage(
          "Running elm-format failed. Check the file for syntax errors.",
        );
      }
    }
  };
}
