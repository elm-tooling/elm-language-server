import fs from "fs";
import globby from "globby";
import os from "os";
import path from "path";
import { container } from "tsyringe";
import util from "util";
import { IConnection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { Forest, IForest } from "./forest";
import { IImports, Imports } from "./imports";
import * as utils from "./util/elmUtils";
import { Settings } from "./util/settings";

const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);

interface IFolder {
  filePath: string;
  maintainerAndPackageName?: string;
  writeable: boolean;
  isExposed: boolean;
  homeFolders: string[];
}

export interface IElmWorkspace {
  init(): void;
  hasDocument(uri: URI): boolean;
  hasPath(uri: URI): boolean;
  getForest(): IForest;
  getImports(): IImports;
  getRootPath(): URI;
}

export class ElmWorkspace implements IElmWorkspace {
  private elmFolders: {
    uri: string;
    writeable: boolean;
    maintainerAndPackageName?: string;
  }[] = [];
  private forest: Forest;
  private imports: Imports;
  private connection: IConnection;
  private settings: Settings;

  constructor(private rootPath: URI) {
    this.forest = container.resolve("Forest");
    this.settings = container.resolve("Settings");
    this.connection = container.resolve("Connection");
    this.connection.console.info(
      `Starting language server for folder: ${this.rootPath.toString()}`,
    );

    this.imports = new Imports();
  }

  public async init(): Promise<void> {
    await this.initWorkspace();
  }

  public hasDocument(uri: URI): boolean {
    return this.forest.existsTree(uri.toString());
  }

  public hasPath(uri: URI): boolean {
    return this.elmFolders
      .map((f) => f.uri)
      .some((elmFolder) => uri.fsPath.startsWith(elmFolder));
  }

  public getForest(): IForest {
    return this.forest;
  }

  public getImports(): IImports {
    return this.imports;
  }

  public getRootPath(): URI {
    return this.rootPath;
  }

  private async initWorkspace(): Promise<void> {
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
    const pathToElmJson = path.join(this.rootPath.fsPath, "elm.json");
    this.connection.console.info(`Reading elm.json from ${pathToElmJson}`);
    try {
      // Find elm files and feed them to tree sitter
      const elmJson = require(pathToElmJson);
      const type = elmJson.type;
      if (type === "application") {
        elmJson["source-directories"].forEach((folder: string) => {
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
          if (Object.prototype.hasOwnProperty.call(dependencies, key)) {
            const maintainer = key.substring(0, key.indexOf("/"));
            const packageName = key.substring(key.indexOf("/") + 1, key.length);

            const pathToPackageWithVersion = `${packagesRoot}${maintainer}/${packageName}/${dependencies[key]}`;
            this.elmFolders.push({
              maintainerAndPackageName: `${maintainer}/${packageName}`,
              uri: pathToPackageWithVersion,
              writeable: false,
            });
          }
        }
      } else {
        for (const key in dependencies) {
          if (Object.prototype.hasOwnProperty.call(dependencies, key)) {
            const maintainer = key.substring(0, key.indexOf("/"));
            const packageName = key.substring(key.indexOf("/") + 1, key.length);

            const pathToPackage = `${packagesRoot}${maintainer}/${packageName}/`;
            const readDir = await readdir(pathToPackage, "utf8");

            const allVersionFolders = readDir.map((folderName) => {
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
              ? `${matchedFolder.versionPath}`
              : `${
                  allVersionFolders[allVersionFolders.length - 1].versionPath
                }`;

            this.elmFolders.push({
              maintainerAndPackageName: `${maintainer}/${packageName}`,
              uri: pathToPackageWithVersion,
              writeable: false,
            });
          }
        }
      }

      const elmFilePaths = await this.findElmFilesInFolders(this.elmFolders);
      this.connection.console.info(
        `Found ${elmFilePaths.length.toString()} files to add to the project`,
      );

      if (elmFilePaths.every((a) => !a.writeable)) {
        this.connection.window.showErrorMessage(
          "The path or paths you entered in the 'source-directories' field of your 'elm.json' does not contain any elm files.",
        );
      }

      for (const filePath of elmFilePaths) {
        this.readAndAddToForest(filePath);
      }

      this.connection.console.info(
        `Done parsing all files for ${pathToElmJson}`,
      );
    } catch (error) {
      this.connection.console.error(
        `Error parsing files for ${pathToElmJson}:\n${error.stack}`,
      );
    }
  }

  private async findElmFilesInFolders(
    elmFolders: {
      uri: string;
      writeable: boolean;
      maintainerAndPackageName?: string;
    }[],
  ): Promise<IFolder[]> {
    let elmFilePathPromises: Promise<IFolder[]>[] = [];
    for (const element of elmFolders) {
      elmFilePathPromises = elmFilePathPromises.concat(
        this.findElmFilesInFolder(element),
      );
    }
    return (await Promise.all(elmFilePathPromises)).reduce(
      (a, b) => a.concat(b),
      [],
    );
  }

  private async findElmFilesInFolder(element: {
    uri: string;
    writeable: boolean;
    maintainerAndPackageName?: string;
  }): Promise<IFolder[]> {
    // Cleanup the path on windows, as globby does not like backslashes
    const globUri = element.uri.replace(/\\/g, "/");

    this.connection.console.info(`Glob ${globUri}/**/*.elm`);

    // As packages are not writeable, we want to handle these differently
    if (element.writeable) {
      return (
        await globby(`${globUri}/**/*.elm`, {
          suppressErrors: true,
        })
      ).map((matchingPath) => ({
        maintainerAndPackageName: element.maintainerAndPackageName,
        filePath: matchingPath,
        writeable: element.writeable,
        isExposed: true,
        homeFolders: [element.uri],
      }));
    } else {
      const [elmFiles, elmJsonString] = await Promise.all([
        globby(`${globUri}/src/**/*.elm`, { suppressErrors: true }),
        readFile(`${element.uri}/elm.json`, {
          encoding: "utf-8",
        }),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsedJson: unknown = JSON.parse(elmJsonString);
      const exposedModules = this.modulesToFilenames(parsedJson, element.uri);
      const homeFolders = this.homeFolders(parsedJson, element.uri);
      return elmFiles.map((matchingPath) => ({
        maintainerAndPackageName: element.maintainerAndPackageName,
        filePath: matchingPath,
        writeable: element.writeable,
        isExposed: exposedModules.some(
          (a) => a.fsPath === URI.file(matchingPath).fsPath,
        ),
        homeFolders: homeFolders,
      }));
    }
  }

  private modulesToFilenames(elmJson: unknown, pathToPackage: string): URI[] {
    if (!elmJson || !Object.hasOwnProperty.call(elmJson, "exposed-modules")) {
      return [];
    }
    const x = (elmJson as {
      "exposed-modules": Record<string, string | string[]>;
    })["exposed-modules"];

    const result: URI[] = [];

    for (const key in x) {
      if (Object.hasOwnProperty.call(x, key)) {
        const element = x[key];
        if (typeof element === "string") {
          result.push(
            URI.file(
              pathToPackage
                .concat("/src/")
                .concat(element.split(".").join("/").concat(".elm")),
            ),
          );
        } else {
          result.push(
            ...element.map((element) =>
              URI.file(
                pathToPackage
                  .concat("/src/")
                  .concat(element.split(".").join("/").concat(".elm")),
              ),
            ),
          );
        }
      }
    }
    return result;
  }

  private homeFolders(elmJson: unknown, pathToPackage: string): string[] {
    if (
      !elmJson ||
      !Object.hasOwnProperty.call(elmJson, "source-directories")
    ) {
      return [`${pathToPackage}/src`];
    }
    const x = (elmJson as {
      "source-directories": string[];
    })["source-directories"];

    return x.map((a) => `${pathToPackage}/${a}`);
  }

  private packageOrPackagesFolder(elmVersion: string | undefined): string {
    return elmVersion === "0.19.0" ? "package" : "packages";
  }

  private findElmHome(): string {
    const elmHomeVar = process.env.ELM_HOME;

    if (elmHomeVar) {
      return elmHomeVar;
    }

    return utils.isWindows
      ? `${os.homedir()}/AppData/Roaming/elm`
      : `${os.homedir()}/.elm`;
  }

  private readAndAddToForest(filePath: IFolder): void {
    try {
      this.connection.console.info(`Adding ${filePath.filePath.toString()}`);

      this.forest.setEmptyTreeNode(
        URI.file(filePath.filePath).toString(),
        filePath.writeable,
        true,
        filePath.isExposed,
        filePath.homeFolders,
        this.imports,
        filePath.maintainerAndPackageName,
      );
    } catch (error) {
      this.connection.console.error(error.stack);
    }
  }
}
