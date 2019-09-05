import { randomBytes } from "crypto";
import execa = require("execa");
import * as path from "path";
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
import { execCmd } from "../../util/elmUtils";
import { Settings } from "../../util/settings";
import { IElmIssue } from "./diagnosticsProvider";
import { ElmDiagnosticsHelper } from "./elmDiagnosticsHelper";

const ELM_MAKE = "Elm";
const RANDOM_ID = randomBytes(16).toString("hex");
export const CODE_ACTION_ELM_MAKE = `elmLS.elmMakeFixer-${RANDOM_ID}`;

export interface IElmCompilerError {
  type: string;
  errors: IError[];
}

export interface IElmError {
  title: string;
  type: string;
  path: string;
  message: Array<string | IStyledString>;
}

export interface IError {
  path: string | null;
  name: string;
  problems: IProblem[];
}

export interface IProblem {
  title: string;
  region: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  message: Array<string | IStyledString>;
}

export interface IStyledString {
  bold: boolean;
  underline: boolean;
  color: string;
  string: string;
}

export class ElmMakeDiagnostics {
  constructor(
    private connection: IConnection,
    private elmWorkspaceFolder: URI,
    private settings: Settings,
  ) {}

  public createDiagnostics = async (
    filePath: URI,
  ): Promise<Map<string, Diagnostic[]>> => {
    return await this.checkForErrors(
      this.elmWorkspaceFolder.fsPath,
      filePath.fsPath,
    ).then(issues => {
      return issues.length === 0
        ? new Map([[filePath.toString(), []]])
        : ElmDiagnosticsHelper.issuesToDiagnosticMap(
            issues,
            this.elmWorkspaceFolder,
          );
    });
  };

  public onCodeAction(params: CodeActionParams): CodeAction[] {
    const { uri } = params.textDocument;
    const elmMakeDiagnostics: Diagnostic[] = this.filterElmMakeDiagnostics(
      params.context.diagnostics,
    );

    return this.convertDiagnosticsToCodeActions(elmMakeDiagnostics, uri);
  }

  private convertDiagnosticsToCodeActions(
    diagnostics: Diagnostic[],
    uri: string,
  ): CodeAction[] {
    const result: CodeAction[] = [];
    diagnostics.forEach(diagnostic => {
      if (
        diagnostic.message.startsWith("NAMING ERROR") ||
        diagnostic.message.startsWith("BAD IMPORT") ||
        diagnostic.message.startsWith("UNKNOWN LICENSE") ||
        diagnostic.message.startsWith("UNKNOWN PACKAGE") ||
        diagnostic.message.startsWith("UNKNOWN EXPORT")
      ) {
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
      } else if (
        diagnostic.message.startsWith("MODULE NAME MISMATCH") ||
        diagnostic.message.startsWith("UNEXPECTED SYMBOL")
      ) {
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
    cwd: string,
    filename: string,
  ): Promise<IElmIssue[]> {
    const settings = await this.settings.getClientSettings();

    return new Promise(async (resolve, reject) => {
      const relativePathToFile = path.relative(cwd, filename);
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
      const testOrMakeCommandWithOmittedSettings = isTestFile
        ? "elm-test"
        : "elm";
      const options = {
        cmdArguments: args,
        notFoundText: isTestFile
          ? "'elm-test' is not available. Install Elm via 'npm install -g elm-test'."
          : "The 'elm' compiler is not available. Install Elm via 'npm install -g elm'.",
      };

      try {
        // Do nothing on success, but return that there were no errors
        await execCmd(
          testOrMakeCommand,
          testOrMakeCommandWithOmittedSettings,
          options,
          cwd,
          this.connection,
        );
        resolve([]);
      } catch (error) {
        if (typeof error === "string") {
          resolve([]);
        } else {
          const execaError = error as execa.ExecaReturnValue<string>;
          const lines: IElmIssue[] = [];
          execaError.stderr.split("\n").forEach((line: string) => {
            const errorObject = JSON.parse(line);

            if (errorObject.type === "compile-errors") {
              errorObject.errors.forEach((error: IError) => {
                const problems: IElmIssue[] = error.problems.map(
                  (problem: IProblem) => ({
                    details: problem.message
                      .map((message: string | IStyledString) =>
                        typeof message === "string"
                          ? message
                          : `#${message.string}#`,
                      )
                      .join(""),
                    file: error.path
                      ? path.isAbsolute(error.path)
                        ? path.relative(cwd, error.path)
                        : error.path
                      : relativePathToFile,
                    overview: problem.title,
                    region: problem.region,
                    subregion: "",
                    tag: "error",
                    type: "error",
                  }),
                );

                lines.push(...problems);
              });
            } else if (errorObject.type === "error") {
              const problem: IElmIssue = {
                details: errorObject.message
                  .map((message: string | IStyledString) =>
                    typeof message === "string" ? message : message.string,
                  )
                  .join(""),
                file: errorObject.path ? errorObject.path : relativePathToFile,
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
          resolve(lines);
        }
      }
    });
  }
}
