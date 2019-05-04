import { ElmApp, Message, Report } from "elm-analyse/ts/domain";
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
  WorkspaceEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";

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

export interface IElmAnalyseEvents {
  on(event: "new-report", diagnostics: Map<string, Diagnostic[]>): this;
}

export class ElmAnalyseDiagnostics extends EventEmitter {
  private connection: IConnection;
  private elmWorkspace: URI;
  private elmAnalyse: Promise<ElmApp>;
  private filesWithDiagnostics: Set<string> = new Set();

  constructor(connection: IConnection, elmWorkspace: URI) {
    super();
    this.connection = connection;
    this.elmWorkspace = elmWorkspace;
    this.onExecuteCommand = this.onExecuteCommand.bind(this);
    this.onCodeAction = this.onCodeAction.bind(this);

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
    if (params.context.diagnostics && params.context.diagnostics.length) {
      return params.context.diagnostics
        .filter(d => d.source === "elm-analyse" && this.isFixable(d))
        .map(d => {
          const command = {
            arguments: [uri, d],
            command: "elm-analyse-fixer",
            title: d.message.split("\n")[0],
          };
          const action: CodeAction = {
            command,
            diagnostics: [d],
            kind: CodeActionKind.QuickFix,
            title: d.message.split("\n")[0],
          };
          return action;
        });
    }
    return [];
  }

  public async onExecuteCommand(params: ExecuteCommandParams) {
    try {
      if (params.command === "elm-analyse-fixer") {
        const elmAnalyse = await this.elmAnalyse;
        if (params.arguments && params.arguments.length === 2) {
          const uri: URI = params.arguments[0];
          const diagnostic: Diagnostic = params.arguments[1];
          const code: number =
            typeof diagnostic.code === "number" ? diagnostic.code : -1;
          if (code !== -1) {
            return new Promise(resolve => {
              elmAnalyse.ports.onFixQuick.send(code);
              elmAnalyse.ports.sendFixedFile.subscribe(fixedFile => {
                const edit: WorkspaceEdit = {
                  changes: {
                    [uri.toString()]: [
                      {
                        newText: fixedFile.content,
                        range: {
                          end: { line: 9999999, character: 0 },
                          start: { line: 0, character: 0 },
                        },
                      },
                    ],
                  },
                };

                return this.connection.workspace.applyEdit(edit);
              });
            });
          }
        }
      }
    } catch (e) {
      this.connection.console.error(
        `Error executing codeAction. ${e.message} ${e.stack}`,
      );
    }
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
        source: "elm-analyse",
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
      source: "elm-analyse",
    };
  }
}
