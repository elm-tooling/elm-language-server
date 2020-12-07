import fs from "fs";
import globby from "globby";
import os from "os";
import path from "path";
import { container } from "tsyringe";
import util from "util";
import { Connection } from "vscode-languageserver";
import { URI } from "vscode-uri";
import Parser, { Tree } from "web-tree-sitter";
import { ICancellationToken } from "./cancellation";
import { Forest, IForest, ITreeContainer } from "./forest";
import * as utils from "./util/elmUtils";
import {
  IPossibleImportsCache,
  PossibleImportsCache,
} from "./util/possibleImportsCache";
import { Settings } from "./util/settings";
import { Diagnostic } from "./util/types/diagnostics";
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

type ElmJson = IElmApplicationJson | IElmPackageJson;

interface IElmApplicationJson {
  type: "application";
  "source-directories": string[];
  "elm-version": string;
  dependencies: {
    direct: {
      [module: string]: string;
    };
    indirect: {
      [module: string]: string;
    };
  };
  "test-dependencies": {
    direct: {
      [module: string]: string;
    };
    indirect: {
      [module: string]: string;
    };
  };
}

interface IElmPackageJson {
  type: "package";
  name: string;
  summary: string;
  license: string;
  version: string;
  "exposed-modules": string[];
  "elm-version": string;
  dependencies: {
    [module: string]: string;
  };
  "test-dependencies": {
    [module: string]: string;
  };
}

export interface IElmWorkspace {
  init(progressCallback: (percent: number) => void): void;
  hasDocument(uri: URI): boolean;
  hasPath(uri: URI): boolean;
  getPath(uri: URI): string | undefined;
  getSourceFile(uri: string): ITreeContainer | undefined;
  getForest(synchronize?: boolean): IForest;
  getRootPath(): URI;
  getTypeCache(): TypeCache;
  getTypeChecker(): TypeChecker;
  markAsDirty(): void;
  getPossibleImportsCache(): IPossibleImportsCache;
  getOperatorsCache(): Map<string, DefinitionResult>;
  getSemanticDiagnostics(
    sourceFile: ITreeContainer,
    cancellationToken?: ICancellationToken,
  ): Diagnostic[];
  getSemanticDiagnosticsAsync(
    sourceFile: ITreeContainer,
    cancellationToken?: ICancellationToken,
  ): Promise<Diagnostic[]>;
  getSyntacticDiagnostics(sourceFile: ITreeContainer): Diagnostic[];
  getSuggestionDiagnostics(
    sourceFile: ITreeContainer,
    cancellationToken?: ICancellationToken,
  ): Diagnostic[];
}

export interface IRootFolder {
  writeable: boolean;
  maintainerAndPackageName?: string;
}

export class ElmWorkspace implements IElmWorkspace {
  private elmFolders = new Map<string, IRootFolder>();
  private forest: IForest = new Forest(new Map());
  private parser: Parser;
  private connection: Connection;
  private settings: Settings;
  private typeCache: TypeCache;
  private typeChecker: TypeChecker | undefined;
  private dirty = true;
  private possibleImportsCache: IPossibleImportsCache;
  private operatorsCache: Map<string, DefinitionResult>;
  private diagnosticsCache: Map<string, Diagnostic[]>;

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
    this.diagnosticsCache = new Map<string, Diagnostic[]>();
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
    return Array.from(this.elmFolders.keys()).find((elmFolder) =>
      uri.fsPath.startsWith(elmFolder),
    );
  }

  public getSourceFile(uri: string): ITreeContainer | undefined {
    return this.getForest().getByUri(uri);
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
      this.diagnosticsCache.clear();
    }
  }

  public getPossibleImportsCache(): IPossibleImportsCache {
    return this.possibleImportsCache;
  }

  public getOperatorsCache(): Map<string, DefinitionResult> {
    return this.operatorsCache;
  }

  public getSemanticDiagnostics(
    sourceFile: ITreeContainer,
    cancellationToken?: ICancellationToken,
  ): Diagnostic[] {
    const cached = this.diagnosticsCache.get(sourceFile.uri);

    if (cached) {
      return cached;
    }

    const diagnostics = this.getTypeChecker().getDiagnostics(
      sourceFile,
      cancellationToken,
    );

    this.diagnosticsCache.set(sourceFile.uri, diagnostics);
    return diagnostics;
  }

  public async getSemanticDiagnosticsAsync(
    sourceFile: ITreeContainer,
    cancellationToken?: ICancellationToken,
  ): Promise<Diagnostic[]> {
    const cached = this.diagnosticsCache.get(sourceFile.uri);

    if (cached) {
      return Promise.resolve(cached);
    }

    const diagnostics = await this.getTypeChecker().getDiagnosticsAsync(
      sourceFile,
      cancellationToken,
    );

    this.diagnosticsCache.set(sourceFile.uri, diagnostics);
    return diagnostics;
  }

  public getSyntacticDiagnostics(sourceFile: ITreeContainer): Diagnostic[] {
    // Getting the type checker will bind the file if its not
    this.getTypeChecker();
    return sourceFile.parseDiagnostics;
  }

  public getSuggestionDiagnostics(
    sourceFile: ITreeContainer,
    cancellationToken?: ICancellationToken,
  ): Diagnostic[] {
    return this.getTypeChecker().getSuggestionDiagnostics(
      sourceFile,
      cancellationToken,
    );
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

    const pathToElmJson = path.join(this.rootPath.fsPath, "elm.json");
    this.connection.console.info(`Reading elm.json from ${pathToElmJson}`);
    try {
      // Find elm files and feed them to tree sitter
      const elmJson = require(pathToElmJson) as ElmJson;
      if (elmJson.type === "application") {
        elmJson["source-directories"].forEach((folder: string) => {
          this.elmFolders.set(path.resolve(this.rootPath.fsPath, folder), {
            maintainerAndPackageName: undefined,
            writeable: true,
          });
        });
      } else {
        this.elmFolders.set(path.join(this.rootPath.fsPath, "src"), {
          maintainerAndPackageName: undefined,
          writeable: true,
        });
      }
      this.elmFolders.set(path.join(this.rootPath.fsPath, "tests"), {
        maintainerAndPackageName: undefined,
        writeable: true,
      });
      this.connection.console.info(
        `${this.elmFolders.size} source-dirs and test folders found`,
      );

      const elmHome = this.findElmHome();
      const packagesRoot = `${elmHome}/${elmVersion}/${this.packageOrPackagesFolder(
        elmVersion,
      )}/`;
      const dependencies: { [index: string]: string } =
        elmJson.type === "application"
          ? {
              ...elmJson.dependencies.direct,
              ...elmJson.dependencies.indirect,
              ...elmJson["test-dependencies"].direct,
              ...elmJson["test-dependencies"].indirect,
            }
          : { ...elmJson.dependencies, ...elmJson["test-dependencies"] };
      if (elmJson.type === "application") {
        for (const key in dependencies) {
          if (Object.prototype.hasOwnProperty.call(dependencies, key)) {
            const maintainer = key.substring(0, key.indexOf("/"));
            const packageName = key.substring(key.indexOf("/") + 1, key.length);

            const pathToPackageWithVersion = `${packagesRoot}${maintainer}/${packageName}/${dependencies[key]}`;
            this.elmFolders.set(pathToPackageWithVersion, {
              maintainerAndPackageName: `${maintainer}/${packageName}`,
              writeable: false,
            });
          }
        }
      } else {
        // Resolve dependency tree recursively
        await this.resolveDependencies(dependencies, packagesRoot);
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

  private async resolveDependencies(
    dependencies: { [index: string]: string },
    packagesRoot: string,
  ): Promise<void> {
    for (const key in dependencies) {
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
        : `${allVersionFolders[allVersionFolders.length - 1].versionPath}`;

      if (!this.elmFolders.has(pathToPackageWithVersion)) {
        this.elmFolders.set(pathToPackageWithVersion, {
          maintainerAndPackageName: `${maintainer}/${packageName}`,
          writeable: false,
        });
      }

      // Resolve all dependencies for this dependency
      const elmJsonPath = path.join(pathToPackageWithVersion, "elm.json");
      const elmJson = require(elmJsonPath) as ElmJson;

      if (elmJson.type === "package") {
        await this.resolveDependencies(elmJson.dependencies, packagesRoot);
      }
    }
  }

  private async findElmFilesInFolders(
    elmFolders: Map<string, IRootFolder>,
  ): Promise<IFolder[]> {
    let elmFilePathPromises: Promise<IFolder[]>[] = [];
    for (const [uri, element] of elmFolders) {
      elmFilePathPromises = elmFilePathPromises.concat(
        this.findElmFilesInFolder({ uri, ...element }),
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

      const tree: Tree = this.parser.parse(fileContent);
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
