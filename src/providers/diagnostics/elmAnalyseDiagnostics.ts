import { ElmApp, FixedFile, Message, Report } from "elm-analyse/ts/domain";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import util from "util";
import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  DiagnosticSeverity,
  ExecuteCommandParams,
  IConnection,
  TextDocument,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import * as Diff from "../../util/diff";
import { IClientSettings, Settings } from "../../util/settings";
import { TextDocumentEvents } from "../../util/textDocumentEvents";
import { DocumentFormattingProvider } from "../documentFormatingProvider";

const readFile = util.promisify(fs.readFile);
const fixableErrors = [
  "UnnecessaryParens",
  "UnusedImport",
  "UnusedImportedVariable",
  "UnusedImportAlias",
  "UnusedPatternVariable",
  "UnusedTypeAlias",
  "MultiLineRecordFormatting",
  "DropConsOfItemAndList",
  "DuplicateImport",
];
const ELM_ANALYSE = "elm-analyse";
export const CODE_ACTION_ELM_ANALYSE = "elmLS.elmAnalyseFixer";

export interface IElmAnalyseEvents {
  on(event: "new-report", diagnostics: Map<string, Diagnostic[]>): this;
}

export class ElmAnalyseDiagnostics extends EventEmitter {
  private connection: IConnection;
  private elmWorkspace: URI;
  private elmAnalyse: Promise<ElmApp>;
  private filesWithDiagnostics: Set<string> = new Set();
  private events: TextDocumentEvents;
  private settings: Settings;
  private formattingProvider: DocumentFormattingProvider;

  constructor(
    connection: IConnection,
    elmWorkspace: URI,
    events: TextDocumentEvents,
    settings: Settings,
    formattingProvider: DocumentFormattingProvider,
  ) {
    super();
    this.connection = connection;
    this.elmWorkspace = elmWorkspace;
    this.onExecuteCommand = this.onExecuteCommand.bind(this);
    this.onCodeAction = this.onCodeAction.bind(this);
    this.events = events;
    this.settings = settings;
    this.formattingProvider = formattingProvider;

    this.elmAnalyse = this.setupElmAnalyse();
  }

  public updateFile(uri: URI, text?: string): void {
    this.elmAnalyse.then(elmAnalyse => {
      elmAnalyse.ports.fileWatch.send({
        content: text || null,
        event: "update",
        file: path.relative(this.elmWorkspace.fsPath, uri.fsPath),
      });
    });
  }

  public onCodeAction(params: CodeActionParams): CodeAction[] {
    const { uri } = params.textDocument;

    return params.context.diagnostics
      .filter(
        diagnostic =>
          diagnostic.source === ELM_ANALYSE && this.isFixable(diagnostic),
      )
      .map(diagnostic => {
        const title = diagnostic.message.split("\n")[0];
        return {
          command: {
            arguments: [uri, diagnostic],
            command: CODE_ACTION_ELM_ANALYSE,
            title,
          },
          diagnostics: [diagnostic],
          kind: CodeActionKind.QuickFix,
          title,
        };
      });
  }

  public async onExecuteCommand(params: ExecuteCommandParams) {
    if (params.command !== CODE_ACTION_ELM_ANALYSE) {
      return;
    }

    if (!params.arguments || params.arguments.length !== 2) {
      this.connection.console.warn(
        "Received incorrect number of arguments for elm-analyse fixer. Returning early.",
      );
      return;
    }

    const elmAnalyse = await this.elmAnalyse;
    const uri: URI = params.arguments[0];
    const diagnostic: Diagnostic = params.arguments[1];
    const code: number =
      typeof diagnostic.code === "number" ? diagnostic.code : -1;

    if (code === -1) {
      this.connection.console.warn(
        "Unable to apply elm-analyse fix, unknown error code",
      );
      return;
    }

    const settings = await this.settings.getSettings(this.connection);
    const edits = await this.getFixEdits(elmAnalyse, uri, settings, code);

    return this.connection.workspace.applyEdit({
      changes: {
        [uri.toString()]: edits,
      },
    });
  }

  private async getFixEdits(
    elmAnalyse: ElmApp,
    uri: URI,
    settings: IClientSettings,
    code: number,
  ): Promise<TextEdit[]> {
    return new Promise((resolve, reject) => {
      // Naming the function here so that we can unsubscribe once we get the new file content
      const fixedFileCallback = (fixedFile: FixedFile) => {
        elmAnalyse.ports.sendFixedFile.unsubscribe(fixedFileCallback);
        const oldText = this.events.get(uri.toString());
        if (!oldText) {
          return reject(
            "Unable to apply elm-analyse fix, file content was unavailable.",
          );
        }

        // This formats the fixed file with elm-format first and then figures out the
        // diffs from there, this prevents needing to chain sets of edits
        resolve(
          this.formattingProvider
            .formatText(settings.elmFormatPath, fixedFile.content)
            .then(elmFormatEdits => {
              // Fake a `TextDocument` so that we can use `applyEdits` on `TextDocument`
              const formattedFile = TextDocument.create(
                "file://fakefile.elm",
                "elm",
                0,
                fixedFile.content,
              );

              return Diff.getTextRangeChanges(
                oldText.getText(),
                TextDocument.applyEdits(formattedFile, elmFormatEdits),
              );
            }),
        );
      };

      elmAnalyse.ports.sendFixedFile.subscribe(fixedFileCallback);
      elmAnalyse.ports.onFixQuick.send(code);
    });
  }

  private async setupElmAnalyse(): Promise<ElmApp> {
    const fsPath = this.elmWorkspace.fsPath;
    const elmJson = await readFile(path.join(fsPath, "elm.json"), {
      encoding: "utf-8",
    }).then(JSON.parse);
    const fileLoadingPorts = require("elm-analyse/dist/app/file-loading-ports.js");
    const { Elm } = require("elm-analyse/dist/app/backend-elm.js");
    const elmAnalyse = Elm.Analyser.init({
      flags: {
        project: elmJson,
        registry: [],
        server: false,
      },
    });

    // elm-analyse breaks if there is a trailing slash on the path, it tries to
    // read <dir>//elm.json instead of <div>/elm.json
    fileLoadingPorts.setup(elmAnalyse, {}, fsPath.replace(/[\\/]?$/, ""));

    return new Promise(resolve => {
      // Wait for elm-analyse to send back the first report
      const cb = (firstReport: any) => {
        elmAnalyse.ports.sendReportValue.unsubscribe(cb);
        this.onNewReport(firstReport);
        elmAnalyse.ports.sendReportValue.subscribe(this.onNewReport);
        resolve(elmAnalyse);
      };
      elmAnalyse.ports.sendReportValue.subscribe(cb);
    });
  }

  private onNewReport = (report: Report) => {
    this.connection.console.log(
      `Received new elm-analyse report with ${report.messages.length} messages`,
    );

    // When publishing diagnostics it looks like you have to publish
    // for one URI at a time, so this groups all of the messages for
    // each file and sends them as a batch
    const diagnostics: Map<string, Diagnostic[]> = report.messages.reduce(
      (acc, message) => {
        const uri = URI.file(
          path.join(this.elmWorkspace.fsPath, message.file),
        ).toString();
        const arr = acc.get(uri) || [];
        arr.push(this.messageToDiagnostic(message));
        acc.set(uri, arr);
        return acc;
      },
      new Map(),
    );
    const filesInReport = new Set(diagnostics.keys());
    const filesThatAreNowFixed = new Set(
      [...this.filesWithDiagnostics].filter(
        uriPath => !filesInReport.has(uriPath),
      ),
    );

    this.filesWithDiagnostics = filesInReport;

    // When you fix the last error in a file it no longer shows up in the report, but
    // we still need to clear the error marker for it
    filesThatAreNowFixed.forEach(file => diagnostics.set(file, []));
    this.emit("new-diagnostics", diagnostics);
  };

  private isFixable(diagnostic: Diagnostic): boolean {
    return fixableErrors.some(e => diagnostic.message.indexOf(e) > -1);
  }

  private messageToDiagnostic(message: Message): Diagnostic {
    if (message.type === "FileLoadFailed") {
      return {
        code: "1",
        message: "Error parsing file",
        range: {
          end: { line: 1, character: 0 },
          start: { line: 0, character: 0 },
        },
        severity: DiagnosticSeverity.Error,
        source: ELM_ANALYSE,
      };
    }

    const [
      lineStart,
      colStart,
      lineEnd,
      colEnd,
    ] = message.data.properties.range;
    const range = {
      end: { line: lineEnd - 1, character: colEnd - 1 },
      start: { line: lineStart - 1, character: colStart - 1 },
    };
    return {
      code: message.id,
      // Clean up the error message a bit, removing the end of the line, e.g.
      // "Record has only one field. Use the field's type or introduce a Type. At ((14,5),(14,20))"
      message:
        message.data.description.split(/at .+$/i)[0] +
        "\n" +
        `See https://stil4m.github.io/elm-analyse/#/messages/${message.type}`,
      range,
      severity: DiagnosticSeverity.Warning,
      source: ELM_ANALYSE,
    };
  }
}
