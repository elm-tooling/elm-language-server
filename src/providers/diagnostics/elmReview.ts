/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { workerData, parentPort } from "worker_threads";
import path from "path";

export default async function run(): Promise<void> {
  const pathToElmReview = workerData.pathToElmReview as string;

  const Builder = await import(pathToElmReview + "/lib/build");
  const Runner = await import(pathToElmReview + "/lib/runner");
  const AppState = await import(pathToElmReview + "/lib/state");
  const OsHelpers = await import(pathToElmReview + "/lib/os-helpers");
  const { startReview } = await import(pathToElmReview + "/lib/run-review");

  const options = AppState.getOptions();

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
        app.ports.collectFile.send(elmFile);
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

      app.ports.collectFile.send(elmFile);
    }

    if (message === "fileDeleted") {
      const deletedFile = data as { path: string };
      const relativePath = OsHelpers.makePathOsAgnostic(
        path.relative(process.cwd(), deletedFile.path),
      );

      app.ports.removeFile.send(relativePath);
    }

    if (message === "requestReview") {
      Runner.requestReview(options, app);
    }
  });

  startReview(options, app);
}

void run();
