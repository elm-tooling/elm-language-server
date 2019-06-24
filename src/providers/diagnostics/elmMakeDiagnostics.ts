import * as cp from "child_process";
import * as readline from "readline";
import {
  Diagnostic,
  DiagnosticSeverity,
  IConnection,
  Range,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
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

  public createDiagnostics = async (
    filePath: URI,
  ): Promise<Map<string, Diagnostic[]>> => {
    return await this.checkForErrors(
      this.connection,
      this.elmWorkspaceFolder.fsPath,
      filePath.fsPath,
    ).then(issues => {
      if (issues.length > 0) {
        return this.issuesToDiagnosticMap(issues);
      } else {
        return new Map([[filePath.toString(), []]]);
      }
    });
  };

  private async checkForErrors(
    connection: IConnection,
    rootPath: string,
    filename: string,
  ): Promise<IElmIssue[]> {
    const settings = await this.settings.getSettings(connection);

    return new Promise((resolve, reject) => {
      const makeCommand: string = settings.elmPath;
      const testCommand: string = settings.elmTestPath;
      const isTestFile = utils.isTestFile(filename, rootPath);
      const cwd: string = rootPath;
      let make: cp.ChildProcess;
      if (utils.isWindows) {
        filename = `"${filename}"`;
      }
      const argsMake = [
        "make",
        filename,
        "--report",
        "json",
        "--output",
        "/dev/null",
      ];
      const argsTest = [filename.replace(cwd, ""), "--report", "json"];

      const args = isTestFile ? argsTest : argsMake;
      const testOrMakeCommand = isTestFile ? testCommand : makeCommand;
      if (utils.isWindows) {
        make = cp.exec(`${testOrMakeCommand} ${args.join(" ")}`, { cwd });
      } else {
        make = cp.spawn(testOrMakeCommand, args, { cwd });
      }

      const elmMakeOrTestResult = isTestFile
        ? this.readElmTestResult(make, filename)
        : this.readElmMakeResult(make);

      if (elmMakeOrTestResult) {
        const {
          errorLinesFromElmMake: errorLinesFromElmMakeOrTest,
          lines: lines,
        } = elmMakeOrTestResult;
        make.on("error", (err: Error) => {
          errorLinesFromElmMakeOrTest.close();
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
          errorLinesFromElmMakeOrTest.close();

          resolve(lines);
        });
      }
    });
  }

  private readElmMakeResult(make: cp.ChildProcess) {
    if (!make.stderr) {
      return;
    }
    const errorLinesFromElmMake: readline.ReadLine = readline.createInterface({
      input: make.stderr,
    });
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
    return { errorLinesFromElmMake, lines };
  }

  private readElmTestResult(make: cp.ChildProcess, filename: string) {
    if (!make.stdout) {
      return;
    }
    const errorLinesFromElmMake: readline.ReadLine = readline.createInterface({
      input: make.stdout,
    });
    const lines: IElmIssue[] = [];
    errorLinesFromElmMake.on("line", (line: string) => {
      const errorObject = JSON.parse(line);

      if (
        errorObject.event === "testCompleted" &&
        errorObject.status === "fail"
      ) {
        errorObject.failures.forEach((failure: any) => {
          lines.push({
            details: `Comparison: ${failure.reason.data.comparison}\n Expected: ${failure.reason.data.expected}\n Actual: ${failure.reason.data.actual}\n`,
            file: filename,
            overview: failure.reason.type,
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
            tag: "test",
            type: "error",
          });
        });
      }
    });
    return { errorLinesFromElmMake, lines };
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

  private issuesToDiagnosticMap(
    issues: IElmIssue[],
  ): Map<string, Diagnostic[]> {
    return issues.reduce((acc, issue) => {
      const uri = this.getUriFromIssue(issue);
      const diagnostic = this.elmMakeIssueToDiagnostic(issue);
      const arr = acc.get(uri) || [];
      arr.push(diagnostic);
      acc.set(uri, arr);
      return acc;
    }, new Map());
  }

  private getUriFromIssue(issue: IElmIssue): string {
    if (issue.file.startsWith(".")) {
      issue.file = this.elmWorkspaceFolder + issue.file.slice(1);
    }
    return URI.file(issue.file).toString();
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
      `${issue.overview} - ${issue.details.replace(/\[\d+m/g, "")}`,
      this.severityStringToDiagnosticSeverity(issue.type),
      undefined,
      "Elm",
    );
  }
}
