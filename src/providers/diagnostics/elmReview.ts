import { workerData, parentPort } from "worker_threads";
import path from "path";
import { ElmReviewFile } from "elm-review/lib/state";
import { ElmReviewApp } from "elm-review/lib/runner";

async function run(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const pathToElmReview = workerData.pathToElmReview as string;

  const Builder = (await import(
    pathToElmReview + "/lib/build"
  )) as typeof import("elm-review/lib/build");
  const Runner = (await import(
    pathToElmReview + "/lib/runner"
  )) as typeof import("elm-review/lib/runner");
  const AppState = (await import(
    pathToElmReview + "/lib/state"
  )) as typeof import("elm-review/lib/state");
  const OsHelpers = (await import(
    pathToElmReview + "/lib/os-helpers"
  )) as typeof import("elm-review/lib/os-helpers");
  const { startReview } = (await import(
    pathToElmReview + "/lib/run-review"
  )) as typeof import("elm-review/lib/run-review");

  const options = AppState.getOptions();

  // @ts-expect-error Custom flag for cross-spawn
  process.chdir.disabled = true;

  const { elmModulePath, reviewElmJson, appHash } = await Builder.build(
    options,
  );
  await Builder.buildElmParser(options, reviewElmJson);

  const { app, elmFiles } = await Runner.initializeApp(
    { ...options, watch: true },
    elmModulePath,
    reviewElmJson,
    appHash,
  );

  AppState.filesWereUpdated(elmFiles);

  parentPort?.on("message", ([message, data]) => {
    if (message === "fileUpdated") {
      const updatedFile = data as { path: string; source: string };

      const relativePath = OsHelpers.makePathOsAgnostic(
        path.relative(process.cwd(), updatedFile.path),
      );

      let elmFile = AppState.getFileFromMemoryCache(relativePath);
      if (!elmFile) {
        elmFile = {
          path: relativePath,
          source: "",
          ast: null,
        };
      }

      if (elmFile.source !== updatedFile.source) {
        // NOTE: Mutates the file cache
        elmFile.source = updatedFile.source;
        elmFile.ast = null;

        void collectFile(app, elmFile);
      }
    }

    if (message === "fileCreated") {
      const createdFile = data as { path: string; source: string };
      const relativePath = OsHelpers.makePathOsAgnostic(
        path.relative(process.cwd(), createdFile.path),
      );

      let elmFile = AppState.getFileFromMemoryCache(relativePath);

      const isNewFile = !elmFile;

      if (!elmFile) {
        elmFile = {
          path: relativePath,
          source: "",
          ast: null,
        };
      }

      const newSource = createdFile.source;

      if (elmFile.source !== newSource) {
        // NOTE: Mutates the file cache
        elmFile.source = newSource;
        elmFile.ast = null;
      }

      if (isNewFile) {
        AppState.filesWereUpdated([elmFile]);
      }

      void collectFile(app, elmFile);
    }

    if (message === "fileDeleted") {
      const deletedFile = data as { path: string };
      const relativePath = OsHelpers.makePathOsAgnostic(
        path.relative(process.cwd(), deletedFile.path),
      );

      app.ports.removeFile.send(relativePath);
    }

    if (message === "requestReview") {
      void waitForPendingCollectFiles(() => Runner.requestReview(options, app));
    }
  });

  startReview(options, app);
}

const pendingCollectFiles = new Map<string, Promise<unknown>>();
async function collectFile(
  app: ElmReviewApp,
  elmFile: ElmReviewFile,
): Promise<void> {
  const existing = pendingCollectFiles.get(elmFile.path);

  if (existing) {
    await existing;
  }

  const promise = new Promise((resolve) => {
    const acknowledgeFileReceipt = (file: ElmReviewFile): void => {
      if (file.path === elmFile.path) {
        app.ports.acknowledgeFileReceipt.unsubscribe(acknowledgeFileReceipt);
        resolve(null);
      }
    };

    app.ports.acknowledgeFileReceipt.subscribe(acknowledgeFileReceipt);
    app.ports.collectFile.send(elmFile);
  });

  pendingCollectFiles.set(elmFile.path, promise);
  await promise;
  pendingCollectFiles.delete(elmFile.path);
}

async function waitForPendingCollectFiles(
  requestor: () => void,
): Promise<void> {
  while (pendingCollectFiles.size > 0) {
    await Promise.all(pendingCollectFiles.values());
  }
  requestor();
}

void run();
