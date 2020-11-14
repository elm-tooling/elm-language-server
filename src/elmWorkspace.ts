import fs from "fs";
import globby from "globby";
import os from "os";
import path from "path";
import { container } from "tsyringe";
import util from "util";
import { IConnection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import Parser, { Tree } from "web-tree-sitter";
import { Forest, IForest } from "./forest";
import { IPossibleImportsCache, PossibleImportsCache } from "./providers";
import * as utils from "./util/elmUtils";
import { execCmd } from "./util/elmUtils";
import { Settings } from "./util/settings";
import { TypeCache } from "./util/types/typeCache";
import {
  createTypeChecker,
  DefinitionResult,
  TypeChecker,
} from "./util/types/typeChecker";

const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);

interface IFolder {
  path: string;
  maintainerAndPackageName?: string;
  writeable: boolean;
  isExposed: boolean;
}

export interface IElmWorkspace {
  init(progressCallback: (percent: number) => void): void;
  hasDocument(uri: URI): boolean;
  hasPath(uri: URI): boolean;
  getPath(uri: URI): string | undefined;
  getForest(synchronize?: boolean): IForest;
  getRootPath(): URI;
  getTypeCache(): TypeCache;
  getTypeChecker(): TypeChecker;
  markAsDirty(): void;
  getPossibleImportsCache(): IPossibleImportsCache;
  getOperatorsCache(): Map<string, DefinitionResult>;
}

export interface IRootFolder {
  uri: string;
  writeable: boolean;
  maintainerAndPackageName?: string;
}

export class ElmWorkspace implements IElmWorkspace {
  private elmFolders: IRootFolder[] = [];
  private forest: IForest = new Forest([]);
  private parser: Parser;
  private connection: IConnection;
  private settings: Settings;
  private typeCache: TypeCache;
  private typeChecker: TypeChecker | undefined;
  private dirty = true;
  private possibleImportsCache: IPossibleImportsCache;
  private operatorsCache: Map<string, DefinitionResult>;

  constructor(private rootPath: URI) {
    this.settings = container.resolve("Settings");
    this.connection = container.resolve("Connection");
    this.parser = container.resolve("Parser");
    this.connection.console.info(
      `Starting language server for folder: ${this.rootPath.toString()}`,
    );

    this.typeCache = new TypeCache();
    this.possibleImportsCache = new PossibleImportsCache();
    this.operatorsCache = new Map<string, DefinitionResult>();
  }

  public async init(
    progressCallback: (percent: number) => void,
  ): Promise<void> {
    await this.initWorkspace(progressCallback);
  }

  public hasDocument(uri: URI): boolean {
    return !!this.forest.getTree(uri.toString());
  }

  public hasPath(uri: URI): boolean {
    return !!this.getPath(uri);
  }

  public getPath(uri: URI): string | undefined {
    return this.elmFolders
      .map((f) => f.uri)
      .find((elmFolder) => uri.fsPath.startsWith(elmFolder));
  }

  public getForest(synchronize = true): IForest {
    if (this.dirty && synchronize) {
      this.forest.synchronize();
      this.dirty = false;
    }

    return this.forest;
  }

  public getRootPath(): URI {
    return this.rootPath;
  }

  public getTypeCache(): TypeCache {
    return this.typeCache;
  }

  public getTypeChecker(): TypeChecker {
    if (this.dirty) {
      this.forest.synchronize();
      this.dirty = false;
    }

    return this.typeChecker ?? (this.typeChecker = createTypeChecker(this));
  }

  public markAsDirty(): void {
    if (!this.dirty) {
      this.dirty = true;
      this.typeChecker = undefined;
    }
  }

  public getPossibleImportsCache(): IPossibleImportsCache {
    return this.possibleImportsCache;
  }

  public getOperatorsCache(): Map<string, DefinitionResult> {
    return this.operatorsCache;
  }

  private async initWorkspace(
    progressCallback: (percent: number) => void,
  ): Promise<void> {
    const clientSettings = await this.settings.getClientSettings();
    let progress = 0;
    let elmVersion;
    try {
      elmVersion = await utils.getElmVersion(
        clientSettings,
        this.rootPath,
        this.connection,
      );
    } catch (e) {
      this.connection.console.warn(
        `Could not figure out elm version, this will impact how good the server works. \n ${e.stack}`,
      );
    }

    // const options = {
    //   cmdArguments: ["make"],
    //   notFoundText:
    //     "The 'elm' compiler is not available. Install Elm via 'npm install -g elm'.",
    // };

    // // Run `elm make` on init to download dependencies
    // await execCmd(
    //   clientSettings.elmPath,
    //   "elm",
    //   options,
    //   this.rootPath.toString(),
    //   this.connection,
    // );

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
              ...elmJson.dependencies.indirect,
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

      this.forest = new Forest(this.elmFolders);

      const promiseList: Promise<void>[] = [];
      const PARSE_STAGES = 3;
      const progressDelta = 100 / (elmFilePaths.length * PARSE_STAGES);
      for (const filePath of elmFilePaths) {
        progressCallback((progress += progressDelta));
        promiseList.push(
          this.readAndAddToForest(filePath, () => {
            progressCallback((progress += progressDelta));
          }),
        );
      }
      await Promise.all(promiseList);

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
        path: matchingPath,
        writeable: element.writeable,
        isExposed: true,
      }));
    } else {
      const [elmFiles, elmJsonString] = await Promise.all([
        globby(`${globUri}/src/**/*.elm`, { suppressErrors: true }),
        readFile(`${element.uri}/elm.json`, {
          encoding: "utf-8",
        }),
      ]);
      const exposedModules = this.modulesToFilenames(
        JSON.parse(elmJsonString),
        element.uri,
      );
      return elmFiles.map((matchingPath) => ({
        maintainerAndPackageName: element.maintainerAndPackageName,
        path: matchingPath,
        writeable: element.writeable,
        isExposed: exposedModules.some(
          (a) => a.fsPath === URI.file(matchingPath).fsPath,
        ),
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

  private async readAndAddToForest(
    filePath: IFolder,
    callback: () => void,
  ): Promise<void> {
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
        filePath.isExposed,
        filePath.maintainerAndPackageName,
      );
      callback();
    } catch (error) {
      this.connection.console.error(error.stack);
    }
  }
}
