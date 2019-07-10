import * as cp from "child_process";
import * as readline from "readline";
import { Diagnostic, IConnection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import * as utils from "../../util/elmUtils";
import { Settings } from "../../util/settings";
import { IElmIssue } from "./diagnosticsProvider";
import { ElmDiagnosticsHelper } from "./elmDiagnosticsHelper";

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

      const argsTest = [
        "make",
        filename.replace(cwd, ""),
        "--report",
        "json",
        "--output",
        "/dev/null",
      ];

      const args = isTestFile ? argsTest : argsMake;
      const testOrMakeCommand = isTestFile ? testCommand : makeCommand;
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
