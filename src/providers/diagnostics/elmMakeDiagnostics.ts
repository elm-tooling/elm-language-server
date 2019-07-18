import * as cp from "child_process";
import * as crypto from "crypto";
import * as path from "path";
import * as readline from "readline";
import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  IConnection,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import * as utils from "../../util/elmUtils";
import { Settings } from "../../util/settings";
import { IElmIssue } from "./diagnosticsProvider";
import { ElmDiagnosticsHelper } from "./elmDiagnosticsHelper";

const ELM_MAKE = "Elm";
const RANDOM_ID = crypto.randomBytes(16).toString("hex");
export const CODE_ACTION_ELM_MAKE = `elmLS.elmMakeFixer-${RANDOM_ID}`;

export class ElmMakeDiagnostics {
  constructor(
    private connection: IConnection,
    private elmWorkspaceFolder: URI,
    private settings: Settings,
  ) {
    this.connection = connection;
    this.elmWorkspaceFolder = elmWorkspaceFolder;
    this.settings = settings;
  }

  public createDiagnostics = async (
    filePath: URI,
  ): Promise<Map<string, Diagnostic[]>> => {
    return await this.checkForErrors(
      this.connection,
      this.elmWorkspaceFolder.fsPath,
      filePath.fsPath,
    ).then(issues => {
      if (issues.length > 0) {
        return ElmDiagnosticsHelper.issuesToDiagnosticMap(
          issues,
          this.elmWorkspaceFolder,
        );
      } else {
        return new Map([[filePath.toString(), []]]);
      }
    });
  };

  public onCodeAction(params: CodeActionParams): CodeAction[] {
    const { uri } = params.textDocument;
    const elmMakeDiagnostics: Diagnostic[] = this.filterElmMakeDiagnostics(
      params.context.diagnostics,
    );
    const elmMakeCodeActions = this.convertDiagnosticsToCodeActions(
      elmMakeDiagnostics,
      uri,
    );

    return elmMakeCodeActions.length > 0 ? elmMakeCodeActions : [];
  }

  private convertDiagnosticsToCodeActions(
    diagnostics: Diagnostic[],
    uri: string,
  ): CodeAction[] {
    const result: CodeAction[] = [];
    diagnostics.forEach(diagnostic => {
      if (diagnostic.message.startsWith("NAMING ERROR")) {
        // Offer the name suggestions from elm make to our users
        const regex = /^\s{4}#(.*)#$/gm;
        let matches;

        // tslint:disable-next-line: no-conditional-assignment
        while ((matches = regex.exec(diagnostic.message)) !== null) {
          // This is necessary to avoid infinite loops with zero-width matches
          if (matches.index === regex.lastIndex) {
            regex.lastIndex++;
          }

          matches
            .filter((_, groupIndex) => groupIndex === 1)
            .forEach((match, _) => {
              result.push(this.createQuickFix(uri, match, diagnostic));
            });
        }
      } else if (diagnostic.message.startsWith("MODULE NAME MISMATCH")) {
        // Offer the name suggestions from elm make to our users
        const regex = /# -> #(.*)#$/gm;

        const matches = regex.exec(diagnostic.message);
        if (matches !== null) {
          result.push(this.createQuickFix(uri, matches[1], diagnostic));
        }
      }
    });
    return result;
  }

  private createQuickFix(
    uri: string,
    replaceWith: string,
    diagnostic: Diagnostic,
  ): CodeAction {
    const map: {
      [uri: string]: TextEdit[];
    } = {};
    if (!map[uri]) {
      map[uri] = [];
    }
    map[uri].push(TextEdit.replace(diagnostic.range, replaceWith));
    return {
      diagnostics: [diagnostic],
      edit: { changes: map },
      kind: CodeActionKind.QuickFix,
      title: replaceWith,
    };
  }

  private filterElmMakeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    return diagnostics.filter(diagnostic => diagnostic.source === ELM_MAKE);
  }

  private async checkForErrors(
    connection: IConnection,
    cwd: string,
    filename: string,
  ): Promise<IElmIssue[]> {
    const settings = await this.settings.getSettings(connection);

    return new Promise((resolve, reject) => {
      let relativePathToFile = path.relative(cwd, filename);
      if (utils.isWindows) {
        relativePathToFile = `"${relativePathToFile}"`;
      }
      const argsMake = [
        "make",
        relativePathToFile,
        "--report",
        "json",
        "--output",
        "/dev/null",
      ];

      const argsTest = [
        "make",
        relativePathToFile,
        "--report",
        "json",
        "--output",
        "/dev/null",
      ];

      const makeCommand: string = settings.elmPath;
      const testCommand: string = settings.elmTestPath;
      const isTestFile = utils.isTestFile(filename, cwd);
      const args = isTestFile ? argsTest : argsMake;
      const testOrMakeCommand = isTestFile ? testCommand : makeCommand;
      let make: cp.ChildProcess;
      if (utils.isWindows) {
        make = cp.exec(`${testOrMakeCommand} ${args.join(" ")}`, { cwd });
      } else {
        make = cp.spawn(testOrMakeCommand, args, { cwd });
      }

      if (!make.stderr) {
        return;
      }
      const errorLinesFromElmMake: readline.ReadLine = readline.createInterface(
        {
          input: make.stderr,
        },
      );
      const lines: IElmIssue[] = [];
      errorLinesFromElmMake.on("line", (line: string) => {
        const errorObject = JSON.parse(line);

        if (errorObject.type === "compile-errors") {
          errorObject.errors.forEach((error: any) => {
            const problems = error.problems.map((problem: any) => ({
              details: problem.message
                .map((message: any) =>
                  typeof message === "string" ? message : `#${message.string}#`,
                )
                .join(""),
              file: path.isAbsolute(error.path)
                ? path.relative(cwd, error.path)
                : error.path,
              overview: problem.title,
              region: problem.region,
              subregion: "",
              tag: "error",
              type: "error",
            }));

            lines.push(...problems);
          });
        } else if (errorObject.type === "error") {
          const problem = {
            details: errorObject.message
              .map((message: any) =>
                typeof message === "string" ? message : message.string,
              )
              .join(""),
            file: errorObject.path,
            overview: errorObject.title,
            region: {
              end: {
                column: 1,
                line: 1,
              },
              start: {
                column: 1,
                line: 1,
              },
            },
            subregion: "",
            tag: "error",
            type: "error",
          };

          lines.push(problem);
        }
      });

      make.on("error", (err: Error) => {
        errorLinesFromElmMake.close();
        if (err && (err as any).code === "ENOENT") {
          connection.window.showErrorMessage(
            isTestFile
              ? "'elm-test' is not available. Install Elm via 'npm install -g elm-test'."
              : "The 'elm' compiler is not available. Install Elm via 'npm install -g elm'.",
          );
          resolve([]);
        } else {
          reject(err);
        }
      });
      make.on("close", (code: number, signal: string) => {
        errorLinesFromElmMake.close();

        resolve(lines);
      });
    });
  }
}
