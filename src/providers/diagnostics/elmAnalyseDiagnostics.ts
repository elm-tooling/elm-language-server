import { randomBytes } from "crypto";
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
  DiagnosticTag,
  ExecuteCommandParams,
  IConnection,
  TextEdit,
  ApplyWorkspaceEditResponse,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { IElmWorkspace } from "../../elmWorkspace";
import * as Diff from "../../util/diff";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { Settings } from "../../util/settings";
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
const RANDOM_ID = randomBytes(16).toString("hex");
export const CODE_ACTION_ELM_ANALYSE = `elmLS.elmAnalyseFixer-${RANDOM_ID}`;
export const CODE_ACTION_ELM_ANALYSE_FIX_ALL = `elmLS.elmAnalyseFixer.fixAll-${RANDOM_ID}`;

export interface IElmAnalyseEvents {
  on(event: "new-report", diagnostics: Map<string, Diagnostic[]>): this;
}

export class ElmAnalyseDiagnostics {
  private elmAnalysers: Map<IElmWorkspace, Promise<ElmApp>>;
  private diagnostics: Map<string, Diagnostic[]>;
  private filesWithDiagnostics: Set<string> = new Set();
  private eventEmitter: EventEmitter = new EventEmitter();
  private elmWorkspaceMatcher: ElmWorkspaceMatcher<URI>;

  constructor(
    private connection: IConnection,
    elmWorkspaces: IElmWorkspace[],
    private events: TextDocumentEvents<TextDocument>,
    private settings: Settings,
    private formattingProvider: DocumentFormattingProvider,
  ) {
    this.onExecuteCommand = this.onExecuteCommand.bind(this);
    this.onCodeAction = this.onCodeAction.bind(this);
    this.diagnostics = new Map();
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher(
      elmWorkspaces,
      (uri) => uri,
    );

    this.elmAnalysers = new Map(
      elmWorkspaces.map((ws) => [ws, this.setupElmAnalyse(ws)]),
    );
  }

  public on(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  public async updateFile(uri: URI, text?: string): Promise<void> {
    const workspace = this.elmWorkspaceMatcher.getElmWorkspaceFor(uri);
    const analyser = this.elmAnalysers.get(workspace);
    if (!analyser) {
      throw new Error(`No elm-analyse instance loaded for workspace ${uri}.`);
    }

    await analyser.then((elmAnalyser) => {
      elmAnalyser.ports.fileWatch.send({
        content: text ?? null,
        event: "update",
        file: path.relative(workspace.getRootPath().fsPath, uri.fsPath),
      });
    });
  }

  public onCodeAction(params: CodeActionParams): CodeAction[] {
    const { uri } = params.textDocument;

    // The `CodeActionParams` will only have diagnostics for the region we were in, for the
    // "Fix All" feature we need to know about all of the fixable things in the document
    const fixableDiagnostics = this.fixableDiagnostics(
      this.diagnostics.get(uri.toString()) ?? [],
    );

    const fixAllInFile: CodeAction[] =
      fixableDiagnostics.length > 1
        ? [
            {
              command: {
                arguments: [uri],
                command: CODE_ACTION_ELM_ANALYSE_FIX_ALL,
                title: `Fix all ${fixableDiagnostics.length} issues`,
              },
              diagnostics: fixableDiagnostics,
              kind: CodeActionKind.QuickFix,
              title: `Fix all ${fixableDiagnostics.length} issues`,
            },
          ]
        : [];

    const contextDiagnostics: CodeAction[] = this.fixableDiagnostics(
      params.context.diagnostics,
    ).map((diagnostic) => {
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

    return contextDiagnostics.length > 0
      ? contextDiagnostics.concat(fixAllInFile)
      : [];
  }

  public async onExecuteCommand(
    params: ExecuteCommandParams,
  ): Promise<ApplyWorkspaceEditResponse | undefined> {
    let uri: URI;
    switch (params.command) {
      case CODE_ACTION_ELM_ANALYSE:
        if (!params.arguments || params.arguments.length !== 2) {
          this.connection.console.warn(
            "Received incorrect number of arguments for elm-analyse fixer. Returning early.",
          );
          return;
        }
        uri = params.arguments[0];
        const diagnostic: Diagnostic = params.arguments[1];
        const code: number =
          typeof diagnostic.code === "number" ? diagnostic.code : -1;

        if (code === -1) {
          this.connection.console.warn(
            "Unable to apply elm-analyse fix, unknown diagnostic code",
          );
          return;
        }
        return this.fixer(uri, code);
      case CODE_ACTION_ELM_ANALYSE_FIX_ALL:
        if (!params.arguments || params.arguments.length !== 1) {
          this.connection.console.warn(
            "Received incorrect number of arguments for elm-analyse fixer. Returning early.",
          );
          return;
        }
        uri = params.arguments[0];
        return this.fixer(uri);
    }
  }

  private fixableDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    return diagnostics.filter(
      (diagnostic) =>
        diagnostic.source === ELM_ANALYSE && this.isFixable(diagnostic),
    );
  }

  /**
   * If a diagnosticId is provided it will fix the single issue, if no
   * id is provided it will fix the entire file.
   */
  private async fixer(uri: URI, diagnosticId?: number) {
    const elmWorkspace = this.elmWorkspaceMatcher.getElmWorkspaceFor(uri);

    const edits = await this.getFixEdits(elmWorkspace, uri, diagnosticId);

    return this.connection.workspace.applyEdit({
      changes: {
        [uri.toString()]: edits,
      },
    });
  }

  private async getFixEdits(
    elmWorkspace: IElmWorkspace,
    uri: URI,
    code?: number,
  ): Promise<TextEdit[]> {
    const elmAnalyse = await this.elmAnalysers.get(elmWorkspace);
    const settings = await this.settings.getClientSettings();

    if (!elmAnalyse) {
      throw new Error(`No elm-analyse instance loaded for workspace ${uri}.`);
    }

    const filePath = URI.parse(uri.toString()).fsPath;
    const relativePath = path.relative(
      elmWorkspace.getRootPath().fsPath,
      filePath,
    );

    return new Promise((resolve, reject) => {
      // Naming the function here so that we can unsubscribe once we get the new file content
      const onFixComplete = (fixedFile: FixedFile) => {
        this.connection.console.info(
          `Received fixed file from elm-analyse for path: ${filePath}`,
        );
        elmAnalyse.ports.sendFixedFile.unsubscribe(onFixComplete);
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
            .formatText(
              elmWorkspace.getRootPath(),
              settings.elmFormatPath,
              fixedFile.content,
            )
            .then(
              async (elmFormatEdits) =>
                await this.createEdits(
                  oldText.getText(),
                  fixedFile.content,
                  elmFormatEdits,
                ),
            ),
        );
      };

      elmAnalyse.ports.sendFixedFile.subscribe(onFixComplete);

      if (typeof code === "number") {
        this.connection.console.info(
          `Sending elm-analyse fix request for diagnostic id: ${code}`,
        );
        elmAnalyse.ports.onFixQuick.send(code);
      } else {
        this.connection.console.info(
          `Sending elm-analyse fix request for file: ${relativePath}`,
        );
        elmAnalyse.ports.onFixFileQuick.send(relativePath);
      }
    });
  }

  private async createEdits(
    oldText: string,
    newText: string,
    elmFormatEdits: TextEdit[] | undefined,
  ) {
    if (elmFormatEdits) {
      // Fake a `TextDocument` so that we can use `applyEdits` on `TextDocument`
      const formattedFile = TextDocument.create(
        "file://fakefile.elm",
        "elm",
        0,
        newText,
      );
      return Diff.getTextRangeChanges(
        oldText,
        TextDocument.applyEdits(formattedFile, elmFormatEdits),
      );
    } else {
      return Diff.getTextRangeChanges(oldText, newText);
    }
  }

  private async setupElmAnalyse(elmWorkspace: IElmWorkspace): Promise<ElmApp> {
    const fsPath = elmWorkspace.getRootPath().fsPath;
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

    return new Promise((resolve) => {
      // Wait for elm-analyse to send back the first report
      const cb = (firstReport: any) => {
        elmAnalyse.ports.sendReportValue.unsubscribe(cb);
        const onNewReport = this.onNewReportForWorkspace(elmWorkspace);
        onNewReport(firstReport);
        elmAnalyse.ports.sendReportValue.subscribe(onNewReport);
        resolve(elmAnalyse);
      };
      elmAnalyse.ports.sendReportValue.subscribe(cb);
    });
  }

  private onNewReportForWorkspace = (elmWorkspace: IElmWorkspace) => (
    report: Report,
  ): void => {
    this.connection.console.info(
      `Received new elm-analyse report with ${report.messages.length} messages`,
    );

    // When publishing diagnostics it looks like you have to publish
    // for one URI at a time, so this groups all of the messages for
    // each file and sends them as a batch
    this.diagnostics = report.messages.reduce((acc, message) => {
      const uri = URI.file(
        path.join(elmWorkspace.getRootPath().fsPath, message.file),
      ).toString();
      const arr = acc.get(uri) ?? [];
      arr.push(this.messageToDiagnostic(message));
      acc.set(uri, arr);
      return acc;
    }, new Map());
    const filesInReport = new Set(this.diagnostics.keys());
    const filesThatAreNowFixed = new Set(
      [...this.filesWithDiagnostics].filter(
        (uriPath) => !filesInReport.has(uriPath),
      ),
    );

    this.filesWithDiagnostics = filesInReport;

    // When you fix the last error in a file it no longer shows up in the report, but
    // we still need to clear the error marker for it
    filesThatAreNowFixed.forEach((file) => this.diagnostics.set(file, []));
    this.eventEmitter.emit("new-diagnostics", this.diagnostics);
  };

  private isFixable(diagnostic: Diagnostic): boolean {
    return fixableErrors.some((e) => diagnostic.message.includes(e));
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

    const rangeDefaults = [1, 1, 2, 1];
    const [lineStart, colStart, lineEnd, colEnd] =
      (message.data &&
        message.data.properties &&
        message.data.properties.range) ??
      rangeDefaults;

    const range = {
      end: { line: lineEnd - 1, character: colEnd - 1 },
      start: { line: lineStart - 1, character: colStart - 1 },
    };
    return {
      code: message.id,
      // Clean up the error message a bit, removing the end of the line, e.g.
      // "Record has only one field. Use the field's type or introduce a Type. At ((14,5),(14,20))"
      message: `${
        message.data.description.split(/at .+$/i)[0]
      }\nSee https://stil4m.github.io/elm-analyse/#/messages/${message.type}`,
      range,
      severity: DiagnosticSeverity.Warning,
      source: ELM_ANALYSE,
      tags: message.data.description.startsWith("Unused ")
        ? [DiagnosticTag.Unnecessary]
        : undefined,
    };
  }
}
