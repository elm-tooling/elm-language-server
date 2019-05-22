import * as cp from "child_process";
import * as readline from "readline";
import {
  Diagnostic,
  DiagnosticSeverity,
  IConnection,
  Range,
} from "vscode-languageserver";
import URI from "vscode-uri";
import * as utils from "../../util/elmUtils";
import { Settings } from "../../util/settings";
import { IElmIssue } from "./diagnosticsProvider";

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

  public createDiagnostics = async (filePath: URI): Promise<IElmIssue[]> => {
    return await this.checkForErrors(
      this.connection,
      this.elmWorkspaceFolder.fsPath,
      filePath.fsPath,
    );
  };

  private async checkForErrors(
    connection: IConnection,
    rootPath: string,
    filename: string,
  ): Promise<IElmIssue[]> {
    const settings = await this.settings.getSettings(connection);

    return new Promise((resolve, reject) => {
      const makeCommand: string = settings.elmPath;
      const cwd: string = rootPath;
      let make: cp.ChildProcess;
      if (utils.isWindows) {
        filename = '"' + filename + '"';
      }
      const args = [
        "make",
        filename,
        "--report",
        "json",
        "--output",
        "/dev/null",
      ];
      if (utils.isWindows) {
        make = cp.exec(makeCommand + " " + args.join(" "), { cwd });
      } else {
        make = cp.spawn(makeCommand, args, { cwd });
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
                  typeof message === "string"
                    ? message
                    : "#" + message.string + "#",
                )
                .join(""),
              file: error.path,
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
            "The 'elm make' compiler is not available. Install Elm via 'npm install -g elm'.",
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

  private severityStringToDiagnosticSeverity(
    severity: string,
  ): DiagnosticSeverity {
    switch (severity) {
      case "error":
        return DiagnosticSeverity.Error;
      case "warning":
        return DiagnosticSeverity.Warning;
      default:
        return DiagnosticSeverity.Error;
    }
  }

  private elmMakeIssueToDiagnostic(issue: IElmIssue): Diagnostic {
    const lineRange: Range = Range.create(
      issue.region.start.line - 1,
      issue.region.start.column - 1,
      issue.region.end.line - 1,
      issue.region.end.column - 1,
    );
    return Diagnostic.create(
      lineRange,
      issue.overview + " - " + issue.details.replace(/\[\d+m/g, ""),
      this.severityStringToDiagnosticSeverity(issue.type),
      undefined,
      "Elm",
    );
  }
}
