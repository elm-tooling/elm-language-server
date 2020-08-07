/* eslint-disable @typescript-eslint/no-unsafe-call */
import { randomBytes } from "crypto";
import * as path from "path";
import { container } from "tsyringe";
import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  IConnection,
  TextEdit,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { IForest, ITreeContainer } from "../../forest";
import { IImports } from "../../imports";
import * as utils from "../../util/elmUtils";
import { execCmd } from "../../util/elmUtils";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { ImportUtils } from "../../util/importUtils";
import { RefactorEditUtils } from "../../util/refactorEditUtils";
import { Settings } from "../../util/settings";
import { TreeUtils } from "../../util/treeUtils";
import { Utils } from "../../util/utils";
import { IElmIssue } from "./diagnosticsProvider";
import { ElmDiagnosticsHelper } from "./elmDiagnosticsHelper";
import execa = require("execa");

const ELM_MAKE = "Elm";
const NAMING_ERROR = "NAMING ERROR";
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
  private neededImports: Map<
    string,
    { moduleName: string; valueName?: string; diagnostic: Diagnostic }[]
  > = new Map<
    string,
    { moduleName: string; valueName?: string; diagnostic: Diagnostic }[]
  >();
  private settings: Settings;
  private connection: IConnection;

  constructor() {
    this.settings = container.resolve("Settings");
    this.connection = container.resolve<IConnection>("Connection");
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((uri) => uri);
  }

  public createDiagnostics = async (
    filePath: URI,
  ): Promise<Map<string, Diagnostic[]>> => {
    const workspaceRootPath = this.elmWorkspaceMatcher
      .getElmWorkspaceFor(filePath)
      .getRootPath();
    const diagnostics = await this.checkForErrors(
      workspaceRootPath.fsPath,
      filePath.fsPath,
    ).then((issues) => {
      return issues.length === 0
        ? new Map([[filePath.toString(), []]])
        : ElmDiagnosticsHelper.issuesToDiagnosticMap(issues, workspaceRootPath);
    });

    // Handle import all
    const forest = this.elmWorkspaceMatcher
      .getElmWorkspaceFor(filePath)
      .getForest();

    const exposedValues = ImportUtils.getPossibleImports(
      forest,
      filePath.fsPath,
    );

    // Get all possible imports from the diagnostics for import all
    diagnostics.forEach((innerDiagnostics, uri) => {
      const sourceTree = forest.getByUri(uri);
      this.neededImports.set(uri, []);

      innerDiagnostics.forEach((diagnostic) => {
        if (diagnostic.message.startsWith(NAMING_ERROR)) {
          const valueNode = sourceTree?.parsed?.tree.rootNode.namedDescendantForPosition(
            {
              column: diagnostic.range.start.character,
              row: diagnostic.range.start.line,
            },
            {
              column: diagnostic.range.end.character,
              row: diagnostic.range.end.line,
            },
          );

          // Find imports
          if (valueNode) {
            exposedValues
              .filter(
                (exposed) =>
                  exposed.value === valueNode.text ||
                  ((valueNode.type === "upper_case_qid" ||
                    valueNode.type === "value_qid") &&
                    exposed.value ===
                      valueNode.namedChildren[
                        valueNode.namedChildren.length - 1
                      ].text &&
                    exposed.module === valueNode.namedChildren[0].text),
              )
              .forEach((exposed, i) => {
                if (i === 0) {
                  this.neededImports.get(uri)?.push({
                    moduleName: exposed.module,
                    valueName:
                      valueNode.type !== "upper_case_qid" &&
                      valueNode.type !== "value_qid"
                        ? exposed.valueToImport
                          ? exposed.valueToImport
                          : exposed.value
                        : undefined,
                    diagnostic,
                  });
                }
              });
          }
        }
      });
    });

    return diagnostics;
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

    const forest = this.elmWorkspaceMatcher
      .getElmWorkspaceFor(URI.parse(uri))
      .getForest();

    const exposedValues = ImportUtils.getPossibleImports(forest, uri);

    const imports = this.elmWorkspaceMatcher
      .getElmWorkspaceFor(URI.parse(uri))
      .getImports();

    const sourceTree = forest.getByUri(uri);

    diagnostics.forEach((diagnostic) => {
      if (diagnostic.message.startsWith(NAMING_ERROR)) {
        const valueNode = sourceTree?.parsed?.tree.rootNode.namedDescendantForPosition(
          {
            column: diagnostic.range.start.character,
            row: diagnostic.range.start.line,
          },
          {
            column: diagnostic.range.end.character,
            row: diagnostic.range.end.line,
          },
        );

        let hasImportFix = false;

        // Add import quick fixes
        if (valueNode) {
          exposedValues
            .filter(
              (exposed) =>
                exposed.value === valueNode.text ||
                ((valueNode.type === "upper_case_qid" ||
                  valueNode.type === "value_qid") &&
                  exposed.value ===
                    valueNode.namedChildren[valueNode.namedChildren.length - 1]
                      .text &&
                  exposed.module ===
                    valueNode.namedChildren
                      .slice(0, valueNode.namedChildren.length - 2) // Dots are also namedNodes
                      .map((a) => a.text)
                      .join("")),
            )
            .forEach((exposed) => {
              hasImportFix = true;
              result.push(
                this.createImportQuickFix(
                  uri,
                  diagnostic,
                  exposed.module,
                  valueNode.type !== "upper_case_qid" &&
                    valueNode.type !== "value_qid"
                    ? exposed.valueToImport
                      ? exposed.valueToImport
                      : exposed.value
                    : undefined,
                ),
              );
            });
        }

        // Add import all quick fix
        const filteredImports =
          this.neededImports
            .get(uri)
            ?.filter(
              (data, i, array) =>
                array.findIndex(
                  (d) =>
                    data.moduleName === d.moduleName &&
                    data.valueName === d.valueName,
                ) === i,
            ) ?? [];

        if (hasImportFix && filteredImports.length > 1) {
          // Sort so that the first diagnostic is this one
          this.neededImports
            .get(uri)
            ?.sort((a, b) =>
              a.diagnostic.message === diagnostic.message
                ? -1
                : b.diagnostic.message === diagnostic.message
                ? 1
                : 0,
            );

          result.push(this.createImportAllQuickFix(uri));
        }
      }

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
      } else if (diagnostic.message.startsWith("UNFINISHED CASE")) {
        // Offer the case completion only if we're at the `of`
        const regex = /^\d+\|\s*.* of\s+\s+#\^#/gm;

        const matches = regex.exec(diagnostic.message);
        if (matches !== null) {
          result.push(
            ...this.addCaseQuickfixes(
              sourceTree,
              diagnostic,
              imports,
              uri,
              forest,
            ),
          );
        }
      } else if (
        diagnostic.message.startsWith("MISSING PATTERNS - This `case`")
      ) {
        result.push(
          ...this.addCaseQuickfixes(
            sourceTree,
            diagnostic,
            imports,
            uri,
            forest,
          ),
        );
      }
    });
    return result;
  }

  private addCaseQuickfixes(
    sourceTree: ITreeContainer | undefined,
    diagnostic: Diagnostic,
    imports: IImports,
    uri: string,
    forest: IForest,
  ): CodeAction[] {
    const result = [];
    const valueNode = sourceTree?.parsed?.tree.rootNode.namedDescendantForPosition(
      {
        column: diagnostic.range.start.character,
        row: diagnostic.range.start.line,
      },
      {
        column: diagnostic.range.end.character,
        row: diagnostic.range.end.line,
      },
    );

    if (valueNode) {
      if (
        valueNode.firstNamedChild?.type === "case" &&
        valueNode.namedChildren.length > 1 &&
        valueNode.namedChildren[1].type === "value_expr"
      ) {
        const indent = "    ".repeat(
          (valueNode.firstNamedChild?.startPosition.column % 4) + 1,
        );

        const typeDeclarationNode = TreeUtils.getTypeAliasOfCase(
          valueNode.namedChildren[1].firstNamedChild!.firstNamedChild!,
          sourceTree!.parsed!.tree,
          imports,
          uri,
          forest,
        );

        if (typeDeclarationNode) {
          const fields = TreeUtils.findAllNamedChildrenOfType(
            "union_variant",
            typeDeclarationNode.node,
          );

          const alreadyAvailableBranches = TreeUtils.findAllNamedChildrenOfType(
            "case_of_branch",
            valueNode,
          )
            ?.map(
              (a) => a.firstNamedChild?.firstNamedChild?.firstNamedChild?.text,
            )
            .filter(Utils.notUndefined);

          let edit = "";
          fields?.forEach((unionVariant) => {
            if (
              !alreadyAvailableBranches?.includes(
                unionVariant.firstNamedChild!.text,
              )
            ) {
              const parameters = TreeUtils.findAllNamedChildrenOfType(
                "type_ref",
                unionVariant,
              );

              const caseBranch = `${[
                unionVariant.firstNamedChild!.text,
                parameters
                  ?.map((a) =>
                    a.firstNamedChild?.lastNamedChild?.text.toLowerCase(),
                  )
                  .join(" "),
              ].join(" ")}`;

              edit += `\n${indent}    ${caseBranch} ->\n${indent}        \n`;
            }
          });

          result.push(
            this.createCaseQuickFix(
              uri,
              edit,
              diagnostic,
              `Add missing case branches`,
            ),
          );
        }
      }

      result.push(
        this.createCaseQuickFix(
          uri,
          "\n\n        _ ->\n    ",
          diagnostic,
          `Add \`_\` branch`,
        ),
      );
    }
    return result;
  }

  private createCaseQuickFix(
    uri: string,
    replaceWith: string,
    diagnostic: Diagnostic,
    title: string,
  ): CodeAction {
    const map: {
      [uri: string]: TextEdit[];
    } = {};
    if (!map[uri]) {
      map[uri] = [];
    }
    map[uri].push(TextEdit.insert(diagnostic.range.end, replaceWith));
    return {
      diagnostics: [diagnostic],
      edit: { changes: map },
      kind: CodeActionKind.QuickFix,
      title,
    };
  }

  private createQuickFix(
    uri: string,
    replaceWith: string,
    diagnostic: Diagnostic,
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

  private createImportQuickFix(
    uri: string,
    diagnostic: Diagnostic,
    moduleName: string,
    nameToImport?: string,
  ): CodeAction {
    const changes: {
      [uri: string]: TextEdit[];
    } = {};
    if (!changes[uri]) {
      changes[uri] = [];
    }

    const tree = this.elmWorkspaceMatcher
      .getElmWorkspaceFor(URI.parse(uri))
      .getForest()
      .getTree(uri);

    if (tree) {
      const edit = RefactorEditUtils.addImport(tree, moduleName, nameToImport);

      if (edit) {
        changes[uri].push(edit);
      }
    }

    return {
      diagnostics: [diagnostic],
      edit: { changes },
      kind: CodeActionKind.QuickFix,
      title: nameToImport
        ? `Import '${nameToImport}' from module "${moduleName}"`
        : `Import module "${moduleName}"`,
      isPreferred: true,
    };
  }

  private createImportAllQuickFix(uri: string): CodeAction {
    const changes: {
      [uri: string]: TextEdit[];
    } = {};
    if (!changes[uri]) {
      changes[uri] = [];
    }

    const tree = this.elmWorkspaceMatcher
      .getElmWorkspaceFor(URI.parse(uri))
      .getForest()
      .getTree(uri);

    const imports = this.neededImports.get(uri);

    if (tree && imports) {
      const edit = RefactorEditUtils.addImports(tree, imports);

      if (edit) {
        changes[uri].push(edit);
      }
    }

    return {
      diagnostics: imports?.map((data) => data.diagnostic),
      edit: { changes },
      kind: CodeActionKind.QuickFix,
      title: `Add all missing imports`,
    };
  }

  private filterElmMakeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    return diagnostics.filter((diagnostic) => diagnostic.source === ELM_MAKE);
  }

  private async checkForErrors(
    cwd: string,
    filename: string,
  ): Promise<IElmIssue[]> {
    const settings = await this.settings.getClientSettings();

    return new Promise(async (resolve) => {
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
            let errorObject: any;
            try {
              errorObject = JSON.parse(line);
            } catch (error) {
              this.connection.console.warn(
                "Received an invalid json, skipping error.",
              );
            }

            if (errorObject && errorObject.type === "compile-errors") {
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
            } else if (errorObject && errorObject.type === "error") {
              const problem: IElmIssue = {
                details: errorObject.message
                  .map((message: string | IStyledString) =>
                    typeof message === "string" ? message : message.string,
                  )
                  .join(""),
                // elm-test might supply absolute paths to files
                file: errorObject.path
                  ? path.relative(cwd, errorObject.path)
                  : relativePathToFile,
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
