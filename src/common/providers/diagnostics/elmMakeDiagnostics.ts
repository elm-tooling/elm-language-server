/* eslint-disable @typescript-eslint/no-unsafe-call */
import * as path from "path";
import { container } from "tsyringe";
import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Connection,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { ISourceFile } from "../../../compiler/forest";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { Settings } from "../../util/settings";
import { IDiagnostic, IElmIssue } from "./diagnosticsProvider";
import { ElmDiagnosticsHelper } from "./elmDiagnosticsHelper";
import { IProgram } from "../../../compiler/program";
import { IFileSystemHost } from "../../types";
import type { ExecaReturnValue } from "execa";
import { IElmAnalyseJsonService } from "./elmAnalyseJsonService";

const ELM_MAKE = "Elm";
export const NAMING_ERROR = "NAMING ERROR";
const RANDOM_ID = Date.now().toString();
export const CODE_ACTION_ELM_MAKE = `elmLS.elmMakeFixer-${RANDOM_ID}`;

export interface IElmCompilerError {
  type: string;
  errors: IError[];
}

export interface IElmError {
  title: string;
  type: string;
  path: string;
  message: (string | IStyledString)[];
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
  message: (string | IStyledString)[];
}

export interface IStyledString {
  bold: boolean;
  underline: boolean;
  color: string;
  string: string;
}

export class ElmMakeDiagnostics {
  private elmWorkspaceMatcher: ElmWorkspaceMatcher<URI>;
  private settings: Settings;
  private connection: Connection;
  private elmAnalyseJsonService: IElmAnalyseJsonService;

  constructor(private host: IFileSystemHost) {
    this.settings = container.resolve("Settings");
    this.connection = container.resolve<Connection>("Connection");
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((uri) => uri);
    this.elmAnalyseJsonService = container.resolve<IElmAnalyseJsonService>(
      "ElmAnalyseJsonService",
    );
  }

  public canRun = (sourceFile: ISourceFile): boolean => {
    return URI.parse(sourceFile.uri).fsPath === "file" && !!this.host.execCmd;
  };

  public createDiagnostics = async (
    sourceFile: ISourceFile,
  ): Promise<Map<string, IDiagnostic[]>> => {
    const filePath = URI.parse(sourceFile.uri);
    const program = this.elmWorkspaceMatcher.getProgramFor(filePath);
    return await this.checkForErrors(program, sourceFile).then((issues) => {
      return issues.length === 0
        ? new Map([[filePath.toString(), []]])
        : ElmDiagnosticsHelper.issuesToDiagnosticMap(
            issues,
            program.getRootPath(),
          );
    });
  };

  public onCodeAction(params: CodeActionParams): CodeAction[] {
    const { uri } = params.textDocument;
    const elmMakeDiagnostics: IDiagnostic[] = this.filterElmMakeDiagnostics(
      params.context.diagnostics as IDiagnostic[],
    );

    return this.convertDiagnosticsToCodeActions(elmMakeDiagnostics, uri);
  }

  private hasType(error: any): error is IElmError | IElmCompilerError {
    return "type" in error;
  }

  private convertDiagnosticsToCodeActions(
    diagnostics: IDiagnostic[],
    uri: string,
  ): CodeAction[] {
    const result: CodeAction[] = [];

    diagnostics.forEach((diagnostic) => {
      if (
        diagnostic.message.startsWith(NAMING_ERROR) ||
        diagnostic.message.startsWith("BAD IMPORT") ||
        diagnostic.message.startsWith("UNKNOWN LICENSE") ||
        diagnostic.message.startsWith("UNKNOWN PACKAGE") ||
        diagnostic.message.startsWith("UNKNOWN EXPORT")
      ) {
        // Offer the name suggestions from elm make to our users
        const regex = /^\s{4}#(.*)#$/gm;
        let matches;

        while ((matches = regex.exec(diagnostic.message)) !== null) {
          // This is necessary to avoid infinite loops with zero-width matches
          if (matches.index === regex.lastIndex) {
            regex.lastIndex++;
          }

          matches
            .filter((_, groupIndex) => groupIndex === 1)
            .forEach((match) => {
              result.push(
                this.createQuickFix(
                  uri,
                  match,
                  diagnostic,
                  `Change to \`${match}\``,
                ),
              );
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
          result.push(
            this.createQuickFix(
              uri,
              matches[1],
              diagnostic,
              `Change to \`${matches[1]}\``,
            ),
          );
        }
      }
    });
    return result;
  }

  private createQuickFix(
    uri: string,
    replaceWith: string,
    diagnostic: IDiagnostic,
    title: string,
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
      title,
    };
  }

  private filterElmMakeDiagnostics(diagnostics: IDiagnostic[]): IDiagnostic[] {
    return diagnostics.filter((diagnostic) => diagnostic.source === ELM_MAKE);
  }

  private async checkForErrors(
    program: IProgram,
    sourceFile: ISourceFile,
  ): Promise<IElmIssue[]> {
    const settings = await this.settings.getClientSettings();

    const workspaceRootPath = program.getRootPath().fsPath;

    const fileToRelativePath = (file: ISourceFile): string =>
      path.relative(workspaceRootPath, URI.parse(file.uri).fsPath);

    const sourceFilePath = fileToRelativePath(sourceFile);

    const forestFiles = program.getSourceFiles();

    const allFiles = forestFiles.some((file) => file.uri === sourceFile.uri)
      ? forestFiles
      : forestFiles.concat(sourceFile);

    const projectFiles = allFiles.filter(
      (file) =>
        !file.isDependency &&
        !this.elmAnalyseJsonService.isFileExcluded(file.uri, workspaceRootPath),
    );

    const testFilesForSure = projectFiles.filter((file) => file.isTestFile);
    const otherFiles = projectFiles.filter((file) => !file.isTestFile);

    const entrypointsForSure = otherFiles.filter((file) => {
      switch (file.project.type) {
        case "application":
          return file.exposing?.has("main") ?? false;

        case "package":
          return file.moduleName === undefined
            ? false
            : file.project.exposedModules.has(file.moduleName);
      }
    });

    const urisReferencedByEntrypoints = this.getUrisReferencedByEntrypoints(
      program,
      entrypointsForSure,
    );

    const urisReferencedByTestsForSure = this.getUrisReferencedByEntrypoints(
      program,
      testFilesForSure,
    );

    const onlyRunElmTest = entrypointsForSure.every((file) =>
      urisReferencedByTestsForSure.has(file.uri),
    );

    // Files that aren’t imported from any entrypoint. These could be:
    //
    // - Tests inside `src/`.
    // - New files that aren’t imported by anything yet.
    // - Old leftover files that aren’t imported by anything.
    // - Files that _are_ used and aren’t tests but that still end up here
    //   because of:
    //   - The project doesn’t use `main =`, like `review/` for elm-review.
    //   - The user has accidentally remove `main =` or not exposed it.
    //
    // Since these _could_ be test, we compile them with `elm-test make` rather
    // than `elm make`, so that "test-dependencies" are allowed. If they _aren’t_
    // tests, the only downside of this is that if you accidentally import a
    // test-dependency, you won’t get an error for that. It should be an OK tradeoff.
    const possiblyTestFiles = otherFiles.filter(
      (file) => !urisReferencedByEntrypoints.has(file.uri),
    );

    const argsElm = (files: Array<ISourceFile>): Array<string> => [
      "make",
      ...files.map(fileToRelativePath),
      "--report",
      "json",
      "--output",
      "/dev/null",
    ];

    const argsElmTest = (files: Array<ISourceFile>): Array<string> => {
      const args = [
        "make",
        ...files.map(fileToRelativePath),
        "--report",
        "json",
      ];

      if (settings.elmPath.trim().length > 0) {
        args.push("--compiler", settings.elmPath);
      }

      return args;
    };

    const elmNotFound =
      "The 'elm' compiler is not available. Install Elm via 'npm install -g elm'.";
    const elmTestNotFound =
      "'elm-test' is not available. Install Elm via 'npm install -g elm-test'.";

    // - If all entrypoints are covered by tests, we only need to run `elm-test make`.
    // - Otherwise, call `elm make` for all entrypoints (if any).
    // - Call `elm-test make` for all tests (if any), plus potential tests.
    // - If there’s no `tests/` folder but files that _could_ be tests, try to
    //   call `elm-test make` but fall back to `elm make` in case they’re not
    //   tests and the user hasn’t got elm-test installed.
    const results = await Promise.allSettled([
      entrypointsForSure.length > 0 && !onlyRunElmTest
        ? this.host.execCmd?.(
            [settings.elmPath, argsElm(entrypointsForSure)],
            [["elm", argsElm(entrypointsForSure)]],
            { notFoundText: elmNotFound },
            workspaceRootPath,
          )
        : undefined,
      testFilesForSure.length === 0 && possiblyTestFiles.length > 0
        ? this.host.execCmd?.(
            [settings.elmTestPath, argsElmTest(possiblyTestFiles)],
            // These files _could_ be tests, but since there’s no `tests/` folder we can’t
            // know if we should expect the user to have elm-test installed. If they don’t,
            // they’ll get errors imports from "test-dependencies".
            [
              ["elm-test", argsElmTest(possiblyTestFiles)],
              ["elm", argsElm(possiblyTestFiles)],
            ],
            {
              notFoundText:
                settings.elmTestPath === ""
                  ? elmTestNotFound
                  : // This uses `elmNotFound` since "elm" is the last alternative above.
                    elmNotFound,
            },
            workspaceRootPath,
          )
        : undefined,
      testFilesForSure.length > 0
        ? this.host.execCmd?.(
            [
              settings.elmTestPath,
              argsElmTest(testFilesForSure.concat(possiblyTestFiles)),
            ],
            // Since there’s a `tests/` folder we expect the user to have elm-test installed.
            [
              [
                "elm-test",
                argsElmTest(testFilesForSure.concat(possiblyTestFiles)),
              ],
            ],
            { notFoundText: elmTestNotFound },
            workspaceRootPath,
          )
        : undefined,
    ]);

    const lines: IElmIssue[] = [];
    const linesSet = new Set<string>();

    for (const result of results) {
      if (result.status === "fulfilled") {
        continue;
      }
      const error = result.reason as unknown;
      if (typeof error === "string") {
        continue;
      } else {
        const execaError = error as ExecaReturnValue<string>;
        execaError.stderr.split("\n").forEach((line: string) => {
          let errorObject: unknown;
          try {
            errorObject = JSON.parse(line);
          } catch (error) {
            this.connection.console.warn(
              "Received an invalid json, skipping error.",
            );
          }

          if (
            errorObject &&
            this.hasType(errorObject) &&
            errorObject.type === "compile-errors"
          ) {
            const compilerError = errorObject as IElmCompilerError;
            compilerError.errors.forEach((error: IError) => {
              error.problems.forEach((problem: IProblem) => {
                const issue: IElmIssue = {
                  details: problem.message
                    .map((message: string | IStyledString) =>
                      typeof message === "string"
                        ? message
                        : `#${message.string}#`,
                    )
                    .join(""),
                  file: error.path
                    ? path.isAbsolute(error.path)
                      ? path.relative(workspaceRootPath, error.path)
                      : error.path
                    : sourceFilePath,
                  overview: problem.title,
                  region: problem.region,
                  subregion: "",
                  tag: "error",
                  type: "error",
                };
                const issueString = JSON.stringify(issue);
                if (!linesSet.has(issueString)) {
                  lines.push(issue);
                  linesSet.add(issueString);
                }
              });
            });
          } else if (
            errorObject &&
            this.hasType(errorObject) &&
            errorObject.type === "error"
          ) {
            const error = errorObject as IElmError;
            this.checkIfVersionMismatchesAndCreateMessage(error);

            const issue: IElmIssue = {
              details: error.message
                .map((message: string | IStyledString) =>
                  typeof message === "string" ? message : message.string,
                )
                .join(""),
              // elm-test might supply absolute paths to files
              file: error.path
                ? path.relative(workspaceRootPath, error.path)
                : sourceFilePath,
              overview: error.title,
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

            lines.push(issue);
            const issueString = JSON.stringify(issue);
            if (!linesSet.has(issueString)) {
              lines.push(issue);
              linesSet.add(issueString);
            }
          }
        });
      }
    }

    return lines;
  }

  private checkIfVersionMismatchesAndCreateMessage(
    errorObject: IElmError,
  ): void {
    if (errorObject.title === "ELM VERSION MISMATCH") {
      this.connection.window.showErrorMessage(
        errorObject.message
          .map((message: string | IStyledString) =>
            typeof message === "string" ? message : message.string,
          )
          .join(""),
      );
    }
  }

  private getUrisReferencedByEntrypoints(
    program: IProgram,
    entrypoints: ISourceFile[],
  ): Set<string> {
    const stack: ISourceFile[] = entrypoints.slice();
    const result = new Set<string>(entrypoints.map((file) => file.uri));

    for (let i = 0; i < stack.length; i++) {
      const file = stack[i];
      if (file.resolvedModules !== undefined) {
        for (const uri of file.resolvedModules.values()) {
          const nextFile = program.getSourceFile(uri);
          if (
            nextFile !== undefined &&
            !nextFile.isDependency &&
            !result.has(nextFile.uri)
          ) {
            result.add(nextFile.uri);
            stack.push(nextFile);
          }
        }
      }
    }

    return result;
  }
}
