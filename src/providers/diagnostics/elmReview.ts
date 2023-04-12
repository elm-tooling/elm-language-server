import Builder from "elm-review/lib/build";
import Runner from "elm-review/lib/runner";
import AppState from "elm-review/lib/state";
import OsHelpers from "elm-review/lib/os-helpers";
import { startReview } from "elm-review/lib/run-review";
import { parentPort } from "worker_threads";
import path from "path";

export default async function run(): Promise<void> {
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

    if (message === "requestReview") {
      Runner.requestReview(options, app);
    }
  });

  startReview(options, app);
}

void run();
