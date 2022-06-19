/* eslint-disable @typescript-eslint/no-unsafe-call */
import { container } from "tsyringe";
import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
} from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";
import { ISourceFile } from "../../compiler/forest.js";
import * as utils from "../../compiler/utils/elmUtils.js";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher.js";
import { Settings } from "../../util/settings.js";
import { IDiagnostic } from "./diagnosticsProvider.js";
import { Range } from "vscode-languageserver-textdocument";
import { ExecaReturnValue } from "execa";
import { existsSync } from "fs";
import * as path from "path";

export type IElmReviewDiagnostic = IDiagnostic & {
  data: {
    code: "elm_review";
    fixes: {
      range: Range;
      string: string;
    }[];
  };
};

export function hasElmReviewFixes(
  diagnostic: Diagnostic,
): diagnostic is IElmReviewDiagnostic {
  return (
    (<IDiagnostic>diagnostic)?.data?.code === "elm_review" &&
    (<IElmReviewDiagnostic>diagnostic)?.data?.fixes.length > 0
  );
}

interface IElmReviewError {
  type: "review-errors";
  errors: IFileError[];
}

interface IFileError {
  path: string;
  errors: IError[];
}

interface IError {
  rule: string;
  ruleLink: string;
  message: string;
  details: string[];
  region: IRegion;
  fix?: {
    range: IRegion;
    string: string;
  }[];
  suppressed?: boolean;
}

interface IRegion {
  start: IPosition;
  end: IPosition;
}

interface IPosition {
  line: number;
  column: number;
}

function toLsRange({ start, end }: IRegion): Range {
  return {
    start: {
      character: start.column - 1,
      line: start.line - 1,
    },
    end: {
      character: end.column - 1,
      line: end.line - 1,
    },
  };
}

export class ElmReviewDiagnostics {
  private elmWorkspaceMatcher: ElmWorkspaceMatcher<URI>;
  private settings: Settings;
  private connection: Connection;

  constructor() {
    this.settings = container.resolve("Settings");
    this.connection = container.resolve<Connection>("Connection");
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((uri) => uri);
  }

  public createDiagnostics = async (
    sourceFile: ISourceFile,
  ): Promise<Map<string, IDiagnostic[]>> => {
    const filePath = URI.parse(sourceFile.uri);
    const workspaceRootPath = this.elmWorkspaceMatcher
      .getProgramFor(filePath)
      .getRootPath();
    return await this.checkForErrors(workspaceRootPath);
  };

  private hasType(error: any): error is IElmReviewError {
    return "type" in error;
  }

  private async checkForErrors(
    workspaceRootPath: URI,
  ): Promise<Map<string, IElmReviewDiagnostic[]>> {
    const settings = await this.settings.getClientSettings();
    const fileErrors = new Map<string, IElmReviewDiagnostic[]>();

    if (
      settings.elmReviewDiagnostics === "off" ||
      !existsSync(
        Utils.joinPath(workspaceRootPath, "review", "src", "ReviewConfig.elm")
          .fsPath,
      )
    ) {
      return fileErrors;
    }

    const elmReviewCommand: string = settings.elmReviewPath;
    const cmdArguments = ["--report", "json", "--namespace", "vscode"];
    if (settings.elmPath.trim().length > 0) {
      cmdArguments.push("--compiler", settings.elmPath);
    }
    if (settings.elmFormatPath.trim().length > 0) {
      cmdArguments.push("--elm-format-path", settings.elmFormatPath);
    }
    const options = {
      cmdArguments: cmdArguments,
      notFoundText:
        "'elm-review' is not available. Install elm-review via 'npm install -g elm-review'.",
    };

    try {
      // Do nothing on success, but return that there were no errors
      utils.execCmdSync(
        elmReviewCommand,
        "elm-review",
        options,
        workspaceRootPath.fsPath,
        this.connection,
      );
      return fileErrors;
    } catch (error) {
      if (typeof error === "string") {
        return fileErrors;
      } else {
        const execaError = error as ExecaReturnValue<string>;
        let errorObject: unknown;
        try {
          errorObject = JSON.parse(execaError.stdout);
        } catch (error) {
          this.connection.console.warn(
            "Received an invalid json, skipping error.",
          );
        }

        if (
          errorObject &&
          this.hasType(errorObject) &&
          errorObject.type === "review-errors"
        ) {
          errorObject.errors.forEach(({ path, errors }: IFileError) => {
            const uri = Utils.joinPath(workspaceRootPath, path).toString();

            fileErrors.set(
              uri,
              errors
                .filter((error: IError) => !error.suppressed)
                .map((error: IError) => ({
                  message: error.message,
                  source: "elm-review",
                  range: toLsRange(error.region),
                  severity:
                    settings.elmReviewDiagnostics === "error"
                      ? DiagnosticSeverity.Error
                      : DiagnosticSeverity.Warning,
                  tags: error.rule.startsWith("NoUnused")
                    ? [DiagnosticTag.Unnecessary]
                    : undefined,
                  data: {
                    uri,
                    code: "elm_review",
                    fixes: (error.fix || []).map((fix) => ({
                      string: fix.string,
                      range: toLsRange(fix.range),
                    })),
                  },
                })),
            );
          });
        }
        return fileErrors;
      }
    }
  }
}
