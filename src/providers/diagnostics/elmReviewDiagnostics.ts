/* eslint-disable @typescript-eslint/no-unsafe-call */
import { container } from "tsyringe";
import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
} from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";
import { ElmWorkspaceMatcher } from "../../util/elmWorkspaceMatcher";
import { IClientSettings, Settings } from "../../util/settings";
import { IDiagnostic } from "./diagnosticsProvider";
import { Range } from "vscode-languageserver-textdocument";
import { existsSync } from "fs";

// import AppState from "elm-review/lib/state";
import { SHARE_ENV, Worker } from "worker_threads";
import path = require("path");
import { ASTProvider } from "../astProvider";
import { IProgram } from "../../compiler/program";

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
  path: string | null;
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
  private elmWorkspaces: IProgram[];
  private workers: Map<
    string,
    { worker: Worker; errors: Map<string, IElmReviewDiagnostic[]> | undefined }
  >;

  constructor() {
    this.settings = container.resolve("Settings");
    this.connection = container.resolve<Connection>("Connection");
    this.elmWorkspaces = container.resolve("ElmWorkspaces");
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((uri) => uri);
    this.workers = new Map<
      string,
      {
        worker: Worker;
        errors: Map<string, IElmReviewDiagnostic[]> | undefined;
      }
    >();

    const astProvider = container.resolve(ASTProvider);

    astProvider.onTreeChange(({ sourceFile, newText }) => {
      const filePath = URI.parse(sourceFile.uri);
      const workspaceRootPath = this.elmWorkspaceMatcher
        .getProgramFor(filePath)
        .getRootPath();

      const worker = this.workers.get(workspaceRootPath.toString());
      if (worker) {
        worker.worker.postMessage([
          "fileUpdated",
          { path: filePath.fsPath, source: newText },
        ]);
        worker.errors = undefined;
      }
    });
  }

  public async createDiagnostics(): Promise<Map<string, IDiagnostic[]>> {
    const errorMaps = await Promise.all(
      this.elmWorkspaces.map((program) =>
        this.checkForErrors(program.getRootPath()),
      ),
    );

    const errors = new Map<string, IElmReviewDiagnostic[]>();
    errorMaps.forEach((errorMap) =>
      errorMap.forEach((value, key) => errors.set(key, value)),
    );
    return errors;
  }

  private hasType(error: any): error is IElmReviewError {
    return "type" in error;
  }

  private async checkForErrors(
    workspaceRootPath: URI,
  ): Promise<Map<string, IElmReviewDiagnostic[]>> {
    const settings = await this.settings.getClientSettings();

    if (
      settings.elmReviewDiagnostics === "off" ||
      !existsSync(
        Utils.joinPath(workspaceRootPath, "review", "src", "ReviewConfig.elm")
          .fsPath,
      )
    ) {
      return new Map<string, IElmReviewDiagnostic[]>();
    }

    let worker = this.workers.get(workspaceRootPath.toString());

    if (worker) {
      if (worker.errors) {
        this.connection.console.info("Returning existing elm-review errors");
        return worker.errors;
      }

      this.connection.console.info("Running elm-review for existing worker");
      worker.worker.postMessage(["requestReview", {}]);
      return await this.waitForReviewResult(
        worker.worker,
        workspaceRootPath,
        settings,
      ).finally(() => {
        this.connection.console.info("Finished elm-review for existing worker");
      });
    }

    const cmdArguments = [
      "--report",
      "json",
      "--namespace",
      "vscode",
      "--elmjson",
      path.join(workspaceRootPath.fsPath, "elm.json"),
    ];
    if (settings.elmPath.trim().length > 0) {
      cmdArguments.push("--compiler", settings.elmPath);
    }
    if (settings.elmFormatPath.trim().length > 0) {
      cmdArguments.push("--elm-format-path", settings.elmFormatPath);
    }

    const elmReviewPath = path.join(__dirname, "elmReview.js");

    worker = {
      worker: new Worker(elmReviewPath, {
        argv: cmdArguments,
        stdout: true,
        env: SHARE_ENV,
      }),
      errors: undefined,
    };

    worker.worker.on("error", (err) => {
      this.connection.console.error(err.message);
    });

    this.workers.set(workspaceRootPath.toString(), worker);

    return await this.waitForReviewResult(
      worker.worker,
      workspaceRootPath,
      settings,
    );
  }

  private async waitForReviewResult(
    worker: Worker,
    workspaceRootPath: URI,
    settings: IClientSettings,
  ): Promise<Map<string, IElmReviewDiagnostic[]>> {
    return new Promise((resolve) => {
      const listener = (data: Buffer): void => {
        try {
          worker.stdout.removeListener("data", listener);
          resolve(
            this.toReviewErrors(data.toString(), workspaceRootPath, settings),
          );
        } catch (e: unknown) {
          this.connection.console.warn(e as string);
        }
      };

      worker.stdout.on("data", listener);
    });
  }

  private toReviewErrors(
    json: string,
    workspaceRootPath: URI,
    settings: IClientSettings,
  ): Map<string, IElmReviewDiagnostic[]> {
    const fileErrors = new Map<string, IElmReviewDiagnostic[]>();
    let errorObject: unknown;
    try {
      errorObject = JSON.parse(json);
    } catch (error) {
      this.connection.console.warn("Received an invalid json, skipping error.");
    }

    if (
      errorObject &&
      this.hasType(errorObject) &&
      errorObject.type === "review-errors"
    ) {
      errorObject.errors.forEach(({ path, errors }: IFileError) => {
        if (!path) {
          return;
        }

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
