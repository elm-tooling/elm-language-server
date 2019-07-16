import * as fs from "fs";
import * as path from "path";
import * as prebuildInstall from "prebuild-install";
import { RemoteConsole } from "vscode-languageserver";
import { Runtime } from "../index";

function packageToGithubRepo(name: string): string {
  return name === "tree-sitter" ? "node-tree-sitter" : name;
}

function downloadUrl(
  name: string,
  version: string,
  treeSitterRepo: boolean,
  runtime: Runtime,
): string {
  const repo: string = packageToGithubRepo(name);
  let urlBase: string = `https://github.com/tree-sitter/${repo}/releases/download/v${version}/`;
  if (!treeSitterRepo) {
    urlBase = `https://github.com/razzeee/${repo}/releases/download/v${version}/`;
  }
  const prebuild: string = `${name}-v${version}-${runtime}-v${process.versions.modules}-${process.platform}-${process.arch}.tar.gz`;

  return `${urlBase}${prebuild}`;
}

function fetchPrebuild(
  name: string,
  treeSitterRepo: boolean,
  console: RemoteConsole,
  runtime: Runtime,
): Promise<void | Error> {
  // tslint:disable-next-line: no-console
  console.info(`Fetching ${name}`);
  // Using require.resolve so that this works for both npm and yarn global installs, with
  // npm our node modules are in `<npm global dir/lib/elm-language-server/node_modules/`, but in yarn they
  // can be in a different location, like `<yarn global dir>/node_modules/tree-sitter`
  const pkgRoot: string = path.dirname(require.resolve(`${name}/package.json`));
  // tslint:disable-next-line non-literal-require
  const pkg: {
    name: string;
    version: string;
  } = require(`${pkgRoot}/package.json`);
  const url: string = downloadUrl(
    pkg.name,
    pkg.version,
    treeSitterRepo,
    runtime,
  );
  // tslint:disable-next-line: no-console
  console.info(`Downloading (or using local cache for) ${url}`);

  return new Promise((res, rej) => {
    // try to download+unpack the definition files only if they aren't already
    fs.access(
      `${pkgRoot}/build/Release`,
      fs.constants.F_OK,
      (accessErr: NodeJS.ErrnoException | null) => {
        if (!accessErr) {
          return res();
        }
        if (accessErr.code !== "ENOENT") {
          return rej(accessErr);
        }

        prebuildInstall.download(url, { pkg, path: pkgRoot }, (err: Error) => {
          err ? rej(err) : res();
        });
      },
    );
  });
}

export function rebuildTreeSitter(
  console: RemoteConsole,
  runtime: Runtime,
): Promise<[void | Error, void | Error]> {
  return Promise.all([
    fetchPrebuild("tree-sitter", true, console, runtime),
    fetchPrebuild("tree-sitter-elm", false, console, runtime),
  ]);
}
