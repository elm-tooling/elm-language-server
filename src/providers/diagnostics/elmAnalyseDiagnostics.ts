import { ElmApp, Message, Report } from "elm-analyse/ts/domain";
import * as fs from "fs";
import * as path from "path";
import util from "util";
import {
  Diagnostic,
  DiagnosticSeverity,
  IConnection,
} from "vscode-languageserver";
import URI from "vscode-uri";

const readFile = util.promisify(fs.readFile);
type INewDiagnosticsCallback = (diagnostics: Map<string, Diagnostic[]>) => void;

export class ElmAnalyseDiagnostics {
  private connection: IConnection;
  private elmWorkspace: URI;
  private elmAnalyse: Promise<ElmApp>;
  private filesWithDiagnostics = new Set();
  private onNewDiagnostics: INewDiagnosticsCallback;

  constructor(
    connection: IConnection,
    elmWorkspace: URI,
    onNewDiagnostics: INewDiagnosticsCallback,
  ) {
    this.connection = connection;
    this.elmWorkspace = elmWorkspace;
    this.onNewDiagnostics = onNewDiagnostics;

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
    elmAnalyse.ports.sendReportValue.subscribe(this.onNewReport);

    return elmAnalyse;
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
    this.onNewDiagnostics(diagnostics);
  };

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
