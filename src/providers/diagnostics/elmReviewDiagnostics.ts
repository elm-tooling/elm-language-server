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
import * as fs from "fs";
import { SHARE_ENV, Worker } from "worker_threads";
import * as path from "path";
import { ASTProvider } from "../astProvider";
import { IProgram } from "../../compiler/program";
import util from "util";
import { TextDocumentEvents } from "../../util/textDocumentEvents";

const readFile = util.promisify(fs.readFile);

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

type WorkerWrapper = {
  worker: Worker;
  errors: Map<string, IElmReviewDiagnostic[]> | undefined;
  pendingReview: Promise<Map<string, IElmReviewDiagnostic[]>> | undefined;
};

export class ElmReviewDiagnostics {
  private elmWorkspaceMatcher: ElmWorkspaceMatcher<URI>;
  private settings: Settings;
  private connection: Connection;
  private documentEvents: TextDocumentEvents;
  private elmWorkspaces: IProgram[];
  private workers: Map<string, WorkerWrapper>;
  private pathsToElmReview: Map<string, Promise<string>>;
  private updatedFiles = new Set<string>();

  constructor() {
    this.settings = container.resolve("Settings");
    this.connection = container.resolve<Connection>("Connection");
    this.elmWorkspaces = container.resolve("ElmWorkspaces");
    this.elmWorkspaceMatcher = new ElmWorkspaceMatcher((uri) => uri);
    this.workers = new Map<string, WorkerWrapper>();
    this.pathsToElmReview = new Map<string, Promise<string>>();

    this.documentEvents = container.resolve(TextDocumentEvents);
    const astProvider = container.resolve(ASTProvider);
    const connection = container.resolve<Connection>("Connection");

    astProvider.onTreeChange(({ sourceFile }) => {
      this.updatedFiles.add(sourceFile.uri);
    });

    connection.workspace.onDidCreateFiles(({ files }) => {
      files.forEach((file) => {
        const filePath = URI.parse(file.uri);
        const workspaceRootPath = this.elmWorkspaceMatcher
          .getProgramFor(filePath)
          .getRootPath();

        const worker = this.workers.get(workspaceRootPath.toString());
        if (worker) {
          worker.worker.postMessage([
            "fileCreated",
            {
              path: filePath.fsPath,
              source:
                this.documentEvents.get(file.uri)?.getText() ??
                fs.readFileSync(filePath.fsPath, "utf8"),
            },
          ]);
          worker.errors = undefined;
        }
      });
    });

    connection.workspace.onDidDeleteFiles(({ files }) => {
      files.forEach((file) => {
        const filePath = URI.parse(file.uri);
        const workspaceRootPath = this.elmWorkspaceMatcher
          .getProgramFor(filePath)
          .getRootPath();

        const worker = this.workers.get(workspaceRootPath.toString());
        if (worker) {
          worker.worker.postMessage([
            "fileDeleted",
            {
              path: filePath.fsPath,
            },
          ]);
        }
      });
    });

    this.elmWorkspaces.forEach((program) => {
      const rootPath = program.getRootPath();
      this.pathsToElmReview.set(
        rootPath.toString(),
        this.getPathToElmReview(rootPath),
      );
    });

    this.connection.onShutdown(async () => {
      await Promise.all(
        Array.from(this.workers.values()).map((worker) =>
          worker.worker.terminate(),
        ),
      );
    });
  }

  public startDiagnostics(): void {
    this.updatedFiles.forEach((uri) => {
      const filePath = URI.parse(uri);
      const workspaceRootPath = this.elmWorkspaceMatcher
        .getProgramFor(filePath)
        .getRootPath();

      const worker = this.workers.get(workspaceRootPath.toString());
      if (worker) {
        const newText =
          this.documentEvents.get(uri)?.getText() ??
          fs.readFileSync(filePath.fsPath, "utf8");

        worker.worker.postMessage([
          "fileUpdated",
          { path: filePath.fsPath, source: newText },
        ]);
        worker.errors = undefined;
      }
    });
    this.updatedFiles.clear();
  }

  public async createDiagnostics(): Promise<Map<string, IDiagnostic[]>> {
    // This should be called earlier, but we need to here just in case
    this.startDiagnostics();
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
      !fs.existsSync(
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

      if (worker.pendingReview) {
        await worker.pendingReview;
      }

      this.connection.console.info("Running elm-review for existing worker");
      worker.worker.postMessage(["requestReview", {}]);
      return await this.waitForReviewResult(
        worker,
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

    const elmReviewWorkerPath = path.join(__dirname, "elmReview.js");

    worker = {
      worker: new Worker(elmReviewWorkerPath, {
        argv: cmdArguments,
        stdout: true,
        env: SHARE_ENV,
        workerData: {
          pathToElmReview: await this.getPathToElmReview(workspaceRootPath),
        },
      }),
      errors: undefined,
      pendingReview: undefined,
    };

    worker.worker.on("error", (err) => {
      this.connection.console.error(err.message);
    });

    this.workers.set(workspaceRootPath.toString(), worker);

    return await this.waitForReviewResult(worker, workspaceRootPath, settings);
  }

  private async waitForReviewResult(
    worker: WorkerWrapper,
    workspaceRootPath: URI,
    settings: IClientSettings,
  ): Promise<Map<string, IElmReviewDiagnostic[]>> {
    worker.pendingReview = new Promise((resolve) => {
      const listener = (data: Buffer): void => {
        try {
          resolve(
            this.toReviewErrors(data.toString(), workspaceRootPath, settings),
          );
          worker.worker.stdout.removeListener("data", listener);
        } catch (e: unknown) {
          this.connection.console.warn(e as string);
        }
      };

      worker.worker.stdout.on("data", listener);
    });

    worker.errors = await worker.pendingReview;

    return worker.errors;
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

  private async getPathToElmReview(workspaceRootPath: URI): Promise<string> {
    const cachedPath = this.pathsToElmReview.get(workspaceRootPath.toString());
    if (cachedPath) {
      return cachedPath;
    }

    let currentPath = workspaceRootPath.fsPath;
    let previousPath: string | undefined;
    let checkingEnv = false;
    const envPaths = process.env[pathKey()]?.split(path.delimiter) || [];

    function getNextPathToCheck(): string | undefined {
      if (checkingEnv) {
        return envPaths.shift();
      }

      if (!previousPath) {
        previousPath = currentPath;
        return currentPath;
      }

      previousPath = currentPath;
      currentPath = path.resolve(currentPath, "..");

      if (currentPath !== previousPath) {
        return currentPath;
      }

      checkingEnv = true;
      return envPaths.shift();
    }

    let pathToCheck = getNextPathToCheck();

    while (pathToCheck) {
      const elmReviewPath = path.join(pathToCheck, "node_modules/elm-review");
      const elmReviewPathJsonPath = path.join(elmReviewPath, "package.json");

      try {
        type PackageJson = { version: string };
        const elmReviewPackageJson = JSON.parse(
          await readFile(elmReviewPathJsonPath, {
            encoding: "utf-8",
          }),
        ) as PackageJson;

        this.pathsToElmReview.set(
          workspaceRootPath.toString(),
          Promise.resolve(elmReviewPath),
        );

        this.connection.console.info(
          `Running elm-review '${elmReviewPackageJson.version}' from '${elmReviewPath}'`,
        );

        return elmReviewPath;
      } catch (e) {
        pathToCheck = getNextPathToCheck();
      }
    }

    this.connection.console.error(
      "Could not find a local version of elm-review, using global version.",
    );
    return "elm-review";
  }
}

function pathKey(): string {
  const env = process.env;
  const platform = process.platform;

  if (platform !== "win32") {
    return "PATH";
  }

  return (
    Object.keys(env)
      .reverse()
      .find((key) => key.toUpperCase() === "PATH") || "Path"
  );
}
