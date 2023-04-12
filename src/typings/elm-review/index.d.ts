declare module "elm-review/lib/build" {
  import { Options } from "elm-review/lib/options";

  export function build(options: Options): Promise<{
    elmModulePath: string;
    reviewElmJsonPath: string;
    reviewElmJson: object;
    appHash: string;
  }>;

  export function buildElmParser(
    options: Options,
    reviewElmJson: object,
  ): Promise<string | null>;
}

declare module "elm-review/lib/options" {
  export type Options = { debug: boolean; fix: boolean; watch: boolean };

  export function compute(processArgv: Array<string>): Options;
}

declare module "elm-review/lib/runner" {
  import { Options } from "elm-review/lib/options";
  import { ElmReviewFile } from "elm-review/lib/state";

  export type ElmReviewApp = {
    ports: {
      collectFile: {
        send(file: ElmReviewFile): void;
      };
    };
  };

  export function initializeApp(
    options: Options,
    elmModulePath: string,
    reviewElmJson: object,
    appHash: string,
  ): Promise<{
    app: ElmReviewApp;
    elmVersion: string;
    elmJsonData: object;
    elmFiles: ElmReviewFile[];
    sourceDirectories: unknown[];
  }>;

  export function runReview(options: Options, app: ElmReviewApp): Promise<void>;

  export function startReview(options: Options, app: ElmReviewApp): void;

  export function requestReview(options: Options, app: ElmReviewApp): void;
}

declare module "elm-review/lib/run-review" {
  import { Options } from "elm-review/lib/options";
  import { ElmReviewApp } from "elm-review/lib/runner";

  export function startReview(options: Options, app: ElmReviewApp): void;
}

declare module "elm-review/lib/state" {
  import { Options } from "elm-review/lib/options";

  export type ElmReviewFile = {
    path: string;
    source: string;
    ast: unknown | null;
  };

  export function filesWereUpdated(files: ElmReviewFile[]): void;

  export function getFileFromMemoryCache(
    filePath: string,
  ): ElmReviewFile | undefined;

  export function getOptions(): Options;
}

declare module "elm-review/lib/os-helpers" {
  export function makePathOsAgnostic(path: string): string;
}
