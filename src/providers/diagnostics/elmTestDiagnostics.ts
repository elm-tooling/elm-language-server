import * as cp from "child_process";
import * as readline from "readline";
import { Diagnostic, IConnection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import * as utils from "../../util/elmUtils";
import { Settings } from "../../util/settings";
import { IElmIssue } from "./diagnosticsProvider";
import { ElmDiagnosticsHelper } from "./elmDiagnosticsHelper";

export class ElmTestDiagnostics {
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
      if (issues && issues.length > 0) {
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
      const isTestFile = utils.isTestFile(filename, rootPath);
      if (isTestFile) {
        const testCommand: string = settings.elmTestPath;
        const cwd: string = rootPath;
        let make: cp.ChildProcess;
        if (utils.isWindows) {
          filename = `"${filename}"`;
        }
        const argsTest = [filename.replace(cwd, ""), "--report", "json"];

        if (utils.isWindows) {
          make = cp.exec(`${testCommand} ${argsTest.join(" ")}`, { cwd });
        } else {
          make = cp.spawn(testCommand, argsTest, { cwd });
        }

        const elmTestResult = this.readElmTestResult(make, filename);

        if (elmTestResult) {
          const {
            errorLinesFromElmTest: errorLinesFromElmTest,
            lines: lines,
          } = elmTestResult;
          make.on("error", (err: Error) => {
            errorLinesFromElmTest.close();
            if (err && (err as any).code === "ENOENT") {
              connection.window.showErrorMessage(
                "'elm-test' is not available. Install Elm via 'npm install -g elm-test'.",
              );
              resolve([]);
            } else {
              reject(err);
            }
          });
          make.on("close", (code: number, signal: string) => {
            errorLinesFromElmTest.close();

            resolve(lines);
          });
        }
      } else {
        resolve();
      }
    });
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
    return { errorLinesFromElmTest: errorLinesFromElmMake, lines };
  }
}
