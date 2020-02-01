import fs from "fs";
import globby from "globby";
import os from "os";
import path from "path";
import util from "util";
import { IConnection, ProgressType } from "vscode-languageserver";
import { URI } from "vscode-uri";
import Parser, { Tree } from "web-tree-sitter";
import { Forest } from "./forest";
import { Imports } from "./imports";
import * as utils from "./util/elmUtils";
import { Settings } from "./util/settings";
import { WorkDoneProgress } from "vscode-languageserver/lib/progress";

const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);

interface IFolder {
  path: string;
  maintainerAndPackageName?: string;
  writeable: boolean;
}

export class ElmWorkspace {
  private elmFolders: {
    uri: string;
    writeable: boolean;
    maintainerAndPackageName?: string;
  }[] = [];
  private forest: Forest = new Forest();
  private imports: Imports;

  constructor(
    private rootPath: URI,
    private connection: IConnection,
    private settings: Settings,
    private parser: Parser,
  ) {
    this.connection.console.info(
      `Starting language server for folder: ${this.rootPath}`,
    );

    this.imports = new Imports(parser);
  }

  public async init(progress: WorkDoneProgress) {
    await this.initWorkspace(progress);
  }

  public hasDocument(uri: URI): boolean {
    return !!this.forest.getTree(uri.toString());
  }

  public hasPath(uri: URI): boolean {
    return this.elmFolders
      .map(f => f.uri)
      .some(elmFolder => uri.fsPath.startsWith(elmFolder));
  }

  public getForest(): Forest {
    return this.forest;
  }

  public getImports(): Imports {
    return this.imports;
  }

  public getRootPath(): URI {
    return this.rootPath;
  }

  private async initWorkspace(x: WorkDoneProgress) {
    let progress = 0;
    x.begin("Indexing", progress);
    let elmVersion;
    try {
      elmVersion = await utils.getElmVersion(
        await this.settings.getClientSettings(),
        this.rootPath,
        this.connection,
      );
    } catch (e) {
      this.connection.console.warn(
        `Could not figure out elm version, this will impact how good the server works. \n ${e.stack}`,
      );
    }
    try {
      const pathToElmJson = path.join(this.rootPath.fsPath, "elm.json");
      this.connection.console.info(`Reading elm.json from ${pathToElmJson}`);
      // Find elm files and feed them to tree sitter
      const elmJson = require(pathToElmJson);
      const type = elmJson.type;
      if (type === "application") {
        elmJson["source-directories"].forEach(async (folder: string) => {
          this.elmFolders.push({
            maintainerAndPackageName: undefined,
            uri: path.resolve(this.rootPath.fsPath, folder),
            writeable: true,
          });
        });
      } else {
        this.elmFolders.push({
          maintainerAndPackageName: undefined,
          uri: path.join(this.rootPath.fsPath, "src"),
          writeable: true,
        });
      }
      this.elmFolders.push({
        maintainerAndPackageName: undefined,
        uri: path.join(this.rootPath.fsPath, "tests"),
        writeable: true,
      });
      this.connection.console.info(
        `${this.elmFolders.length} source-dirs and test folders found`,
      );

      const elmHome = this.findElmHome();
      const packagesRoot = `${elmHome}/${elmVersion}/${this.packageOrPackagesFolder(
        elmVersion,
      )}/`;
      const dependencies: { [index: string]: string } =
        type === "application"
          ? {
              ...elmJson.dependencies.direct,
              ...elmJson["test-dependencies"].direct,
            }
          : { ...elmJson.dependencies, ...elmJson["test-dependencies"] };
      if (type === "application") {
        for (const key in dependencies) {
          if (dependencies.hasOwnProperty(key)) {
            const maintainer = key.substring(0, key.indexOf("/"));
            const packageName = key.substring(key.indexOf("/") + 1, key.length);

            const pathToPackageWithVersion = `${packagesRoot}${maintainer}/${packageName}/${dependencies[key]}/src`;
            this.elmFolders.push({
              maintainerAndPackageName: `${maintainer}/${packageName}`,
              uri: pathToPackageWithVersion,
              writeable: false,
            });
          }
        }
      } else {
        for (const key in dependencies) {
          if (dependencies.hasOwnProperty(key)) {
            const maintainer = key.substring(0, key.indexOf("/"));
            const packageName = key.substring(key.indexOf("/") + 1, key.length);

            const pathToPackage = `${packagesRoot}${maintainer}/${packageName}/`;
            const readDir = await readdir(pathToPackage, "utf8");

            const allVersionFolders = readDir.map(folderName => {
              return {
                version: folderName,
                versionPath: `${pathToPackage}${folderName}`,
              };
            });

            const matchedFolder = utils.findDepVersion(
              allVersionFolders,
              dependencies[key],
            );
            const pathToPackageWithVersion = matchedFolder
              ? `${matchedFolder.versionPath}/src`
              : `${
                  allVersionFolders[allVersionFolders.length - 1].versionPath
                }/src`;

            this.elmFolders.push({
              maintainerAndPackageName: `${maintainer}/${packageName}`,
              uri: pathToPackageWithVersion,
              writeable: false,
            });
          }
        }
      }

      const elmFilePaths = this.findElmFilesInFolders(this.elmFolders);
      this.connection.console.info(
        `Found ${elmFilePaths.length.toString()} files to add to the project`,
      );

      if (elmFilePaths.every(a => !a.writeable)) {
        this.connection.window.showErrorMessage(
          "The path or paths you entered in the 'source-directories' field of your 'elm.json' does not contain any elm files.",
        );
      }

      const promiseList: Promise<void>[] = [];
      const progressSteps = (elmFilePaths.length * 2) / 100;
      for (const filePath of elmFilePaths) {
        progress += progressSteps;
        x.report(progressSteps);
        promiseList.push(this.readAndAddToForest(filePath));
      }
      await Promise.all(promiseList);

      this.forest.treeIndex.forEach(item => {
        progress += progressSteps;
        x.report(progressSteps);
        this.connection.console.info(
          `Adding imports ${URI.parse(item.uri).fsPath}`,
        );
        this.imports.updateImports(item.uri, item.tree, this.forest);
      });

      x.done();
      this.connection.console.info("Done parsing all files.");
    } catch (error) {
      this.connection.console.error(error.stack);
    }
  }

  private findElmFilesInFolders(
    elmFolders: {
      uri: string;
      writeable: boolean;
      maintainerAndPackageName?: string;
    }[],
  ): IFolder[] {
    let elmFilePaths: IFolder[] = [];
    for (const element of elmFolders) {
      elmFilePaths = elmFilePaths.concat(this.findElmFilesInFolder(element));
    }
    return elmFilePaths;
  }

  private findElmFilesInFolder(element: {
    uri: string;
    writeable: boolean;
    maintainerAndPackageName?: string;
  }): IFolder[] {
    // Cleanup the path on windows, as globby does not like backslashes
    const globUri = element.uri.replace(/\\/g, "/");

    return globby
      .sync(`${globUri}/**/*.elm`, { suppressErrors: true })
      .map(matchingPath => ({
        maintainerAndPackageName: element.maintainerAndPackageName,
        path: matchingPath,
        writeable: element.writeable,
      }));
  }

  private packageOrPackagesFolder(elmVersion: string | undefined): string {
    return elmVersion === "0.19.0" ? "package" : "packages";
  }

  private findElmHome() {
    const elmHomeVar = process.env.ELM_HOME;

    if (elmHomeVar) {
      return elmHomeVar;
    }

    return utils.isWindows
      ? `${os.homedir()}/AppData/Roaming/elm`
      : `${os.homedir()}/.elm`;
  }

  private async readAndAddToForest(filePath: IFolder): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        this.connection.console.info(`Adding ${filePath.path.toString()}`);
        const fileContent: string = await readFile(filePath.path.toString(), {
          encoding: "utf-8",
        });

        const tree: Tree | undefined = this.parser.parse(fileContent);
        this.forest.setTree(
          URI.file(filePath.path).toString(),
          filePath.writeable,
          true,
          tree,
          filePath.maintainerAndPackageName,
        );
        resolve();
      } catch (error) {
        this.connection.console.error(error.stack);
        reject(error);
      }
    });
  }
}
