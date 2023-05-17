import { container } from "tsyringe";
import { Connection, Disposable } from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";
import Parser, { Tree } from "web-tree-sitter";
import type { ICancellationToken } from "../common/cancellation";
import { ElmPackageCache, IElmPackageCache } from "./elmPackageCache";
import { Forest, IForest, IKernelSourceFile, ISourceFile } from "./forest";
import * as utils from "./utils/elmUtils";
import { IVersion } from "./utils/elmUtils";
import {
  IPossibleImportsCache,
  PossibleImportsCache,
} from "../common/util/possibleImportsCache";
import { Settings } from "../common/util/settings";
import { Diagnostic } from "./diagnostics";
import { TypeCache } from "./typeCache";
import { createTypeChecker, TypeChecker } from "./typeChecker";
import { CommandManager } from "../common/commandManager";
import { IFileSystemHost } from "../common/types";

interface IElmFile {
  path: URI;
  maintainerAndPackageName?: string;
  project: ElmProject;
  isTestFile: boolean;
  isDependency: boolean;
  isKernel: boolean;
  tree?: Tree;
  moduleName?: string;
}

export type ElmJson = IElmApplicationJson | IElmPackageJson;

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
  "exposed-modules": string[] | { [name: string]: string[] };
  "elm-version": string;
  dependencies: {
    [module: string]: string;
  };
  "test-dependencies": {
    [module: string]: string;
  };
}

export interface IProgram extends Disposable {
  init(progressCallback?: (percent: number) => void): Promise<void>;
  isInitialized: boolean;
  hasDocument(uri: URI): boolean;
  isInSourceDirectory(uri: string): boolean;
  getSourceDirectoryOfFile(uri: string): string | undefined;
  getSourceFile(uri: string): ISourceFile | undefined;
  getSourceFiles(): readonly ISourceFile[];
  getSourceFileOfImportableModule(
    sourceFile: ISourceFile,
    importableModuleName: string,
  ): ISourceFile | undefined;
  getKernelSourceFileOfImportableModule(
    sourceFile: ISourceFile,
    importableModuleName: string,
  ): IKernelSourceFile | undefined;
  getForest(synchronize?: boolean): IForest;
  getRootPath(): URI;
  getTypeCache(): TypeCache;
  getTypeChecker(): TypeChecker;
  markAsDirty(): void;
  getPossibleImportsCache(): IPossibleImportsCache;
  getSemanticDiagnostics(
    sourceFile: ISourceFile,
    cancellationToken?: ICancellationToken,
  ): Diagnostic[];
  getSemanticDiagnosticsAsync(
    sourceFile: ISourceFile,
    cancellationToken?: ICancellationToken,
  ): Promise<Diagnostic[]>;
  getSyntacticDiagnostics(sourceFile: ISourceFile): Diagnostic[];
  getSuggestionDiagnostics(
    sourceFile: ISourceFile,
    cancellationToken?: ICancellationToken,
  ): Diagnostic[];
  getImportableModules(
    sourceFile: ISourceFile,
  ): { moduleName: string; uri: string }[];
}

export type ElmProject = IElmApplication | IElmPackage;

interface IElmProject {
  type: string;
  uri: string;
  dependencies: Map<string, IElmPackage>;
  testDependencies: Map<string, IElmPackage>;
  sourceDirectories: string[];
  testDirectories: string[];
  moduleToUriMap: Map<string, string>;
  testModuleToUriMap: Map<string, string>;
}

interface IElmApplication extends IElmProject {
  type: "application";
}

interface IElmPackage extends IElmProject {
  type: "package";
  maintainerAndPackageName: string;
  exposedModules: Set<string>;
  isDependency: boolean;
}

export type IProgramHost = IFileSystemHost;

export class Program implements IProgram {
  private parser: Parser;
  private connection: Connection;
  private settings: Settings;
  private typeCache: TypeCache;
  private typeChecker: TypeChecker | undefined;
  private dirty = true;
  private possibleImportsCache: IPossibleImportsCache;
  private diagnosticsCache: Map<string, Diagnostic[]>;
  private rootProject!: ElmProject;
  private forest!: IForest;
  private elmPackageCache!: IElmPackageCache;
  private resolvedPackageCache = new Map<string, IElmPackage>();
  private host: IProgramHost;
  private filesWatching = new Set<string>();
  private _isInitialized = false;
  private _initializePromise: Promise<void> | undefined;
  private _initializeProgressCallback: ((percent: number) => void) | undefined;

  private disposables: Disposable[] = [];

  constructor(private rootPath: URI, programHost: IProgramHost) {
    this.settings = container.resolve("Settings");
    this.connection = container.resolve("Connection");
    this.parser = container.resolve("Parser");
    this.connection.console.info(
      `Starting language server for folder: ${this.rootPath.toString()}`,
    );

    this.typeCache = new TypeCache();
    this.possibleImportsCache = new PossibleImportsCache();
    this.diagnosticsCache = new Map<string, Diagnostic[]>();
    this.host = programHost;
  }

  public async init(
    progressCallback?: (percent: number) => void,
  ): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    if (this._initializePromise) {
      this._initializeProgressCallback ??= progressCallback;
      return this._initializePromise;
    }

    this._initializePromise = this.initWorkspace();
    await this._initializePromise;
    this._isInitialized = true;
  }

  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  public hasDocument(uri: URI): boolean {
    return !!this.forest?.getTree(uri.toString());
  }

  public isInSourceDirectory(uri: string): boolean {
    return !!this.getSourceDirectoryOfFile(uri);
  }

  public getSourceDirectoryOfFile(uri: string): string | undefined {
    if (!this.rootProject) {
      return undefined;
    }

    uri = URI.parse(uri).toString();
    return [
      ...this.rootProject.sourceDirectories,
      ...this.rootProject.testDirectories,
    ].find((elmFolder) => uri.startsWith(elmFolder));
  }

  public getSourceFile(uri: string): ISourceFile | undefined {
    return this.getForest().getByUri(uri);
  }

  public getSourceFiles(): readonly ISourceFile[] {
    return Array.from(this.getForest().sourceFiles.values());
  }

  public getSourceFileOfImportableModule(
    sourceFile: ISourceFile,
    importableModuleName: string,
  ): ISourceFile | undefined {
    let moduleUri = sourceFile.project.moduleToUriMap.get(importableModuleName);

    if (!moduleUri && sourceFile.isTestFile) {
      moduleUri =
        sourceFile.project.testModuleToUriMap.get(importableModuleName);
    }

    if (moduleUri) {
      return this.getSourceFile(moduleUri);
    } else {
      return undefined;
    }
  }

  private checkedKernelFiles = new Set<string>();
  public getKernelSourceFileOfImportableModule(
    sourceFile: ISourceFile,
    importableModuleName: string,
  ): IKernelSourceFile | undefined {
    if (
      utils.nameIsKernel(importableModuleName) &&
      utils.isKernelProject(sourceFile.project)
    ) {
      const moduleUri =
        sourceFile.project.moduleToUriMap.get(importableModuleName) ??
        utils
          .getModuleUri(
            importableModuleName,
            Utils.joinPath(URI.parse(sourceFile.project.uri), "src"),
            sourceFile.project,
          )
          .toString();

      const kernelSourceFile = this.getForest().getKernelSourceFile(moduleUri);

      if (kernelSourceFile) {
        return kernelSourceFile;
      }

      if (!this.checkedKernelFiles.has(moduleUri)) {
        this.checkedKernelFiles.add(moduleUri);
        if (this.host.fileExists(URI.parse(moduleUri))) {
          sourceFile.project.moduleToUriMap.set(
            importableModuleName,
            moduleUri,
          );

          return this.getForest().setKernelSourceFile(
            moduleUri,
            sourceFile.project,
            sourceFile.maintainerAndPackageName ?? "",
            importableModuleName,
          );
        }
      }
    }
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

  public getSemanticDiagnostics(
    sourceFile: ISourceFile,
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
    sourceFile: ISourceFile,
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

  public getSyntacticDiagnostics(sourceFile: ISourceFile): Diagnostic[] {
    // Getting the type checker will bind the file if its not
    this.getTypeChecker();
    return [...sourceFile.parseDiagnostics, ...sourceFile.bindDiagnostics];
  }

  public getSuggestionDiagnostics(
    sourceFile: ISourceFile,
    cancellationToken?: ICancellationToken,
  ): Diagnostic[] {
    return this.getTypeChecker().getSuggestionDiagnostics(
      sourceFile,
      cancellationToken,
    );
  }

  public getImportableModules(
    sourceFile: ISourceFile,
  ): { moduleName: string; uri: string }[] {
    return Array.from(sourceFile.project.moduleToUriMap.entries()).map(
      ([moduleName, uri]) => ({
        moduleName,
        uri,
      }),
    );
  }

  public dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private async initWorkspace(): Promise<void> {
    const clientSettings = await this.settings.getClientSettings();

    const pathToElmJson = Utils.joinPath(this.rootPath, "elm.json");
    this.connection.console.info(
      `Reading elm.json from ${pathToElmJson.toString()}`,
    );

    if (!this.filesWatching.has(pathToElmJson.toString())) {
      this.disposables.push(
        this.host.watchFile(pathToElmJson, () => {
          void this.connection.window
            .createWorkDoneProgress()
            .then((progress) => {
              progress.begin("Restarting Elm Language Server", 0);
              this._initializeProgressCallback = (percent: number): void => {
                progress.report(percent, `${percent.toFixed(0)}%`);
              };

              this.initWorkspace()
                .then(() => progress.done())
                .catch(() => {
                  //
                });
            });
        }),
      );
      this.filesWatching.add(pathToElmJson.toString());
    }

    try {
      ElmPackageCache.packagesRoot = this.host.getElmPackagesRoot(
        this.rootPath,
        clientSettings,
      );

      try {
        this.elmPackageCache = new ElmPackageCache(
          this.loadElmJson.bind(this),
          this.host,
        );
      } catch (error) {
        if (error instanceof Error && error.stack) {
          this.connection.window.showErrorMessage(
            `Failed constructing ElmPackageCache for ${pathToElmJson.toString()}:\n${
              error.stack
            }`,
          );
        }

        this.connection.window.showInformationMessage(
          "The package cache is probably broken. Try a restart after removing '~/.elm' or '%APPDATA%\\elm'." +
            "If the error still occurs, try running 'elm init' in a different folder." +
            "If the error appears again, check your PATH for multiple elm installations and verify your installed version",
        );

        throw error;
      }

      this.rootProject = await this.loadRootProject(pathToElmJson);
      this.forest = new Forest(this.rootProject);

      // Stage 1 is finding all elm files in the project
      // Stage 2 is parsing all elm files in the project
      const PROGRESS_STAGES = 2;
      const totalProgress = { percent: 0 };
      const stageProgressCallback = (percent: number): void => {
        this._initializeProgressCallback?.(
          (totalProgress.percent += percent / PROGRESS_STAGES),
        );
      };

      const elmFilePaths = await this.findElmFilesInProject(
        this.rootProject,
        stageProgressCallback,
      );
      this.connection.console.info(
        `Found ${elmFilePaths.length} files to add to the project`,
      );

      if (elmFilePaths.every((a) => a.project !== this.rootProject)) {
        this.connection.window.showErrorMessage(
          "The path or paths you entered in the 'source-directories' field of your 'elm.json' does not contain any elm files.",
        );
      }

      const promiseList: Promise<void>[] = [];
      const PARSE_STAGES = 2;
      const progressDelta = 100 / (elmFilePaths.length * PARSE_STAGES);
      for (const filePath of elmFilePaths) {
        stageProgressCallback(progressDelta);
        promiseList.push(
          this.readAndAddToForest(filePath).then((result) => {
            stageProgressCallback(progressDelta);
            return result;
          }),
        );
      }
      await Promise.all(promiseList);

      CommandManager.initHandlers(this.connection);

      this.connection.console.info(
        `Done parsing all files for ${pathToElmJson.toString()}`,
      );
    } catch (error) {
      if (error instanceof Error && error.stack) {
        this.connection.console.error(
          `Error parsing files for ${pathToElmJson.toString()}:\n${
            error.stack
          }`,
        );
      }
    }

    if (this.forest === null) {
      this.connection.window.showWarningMessage(
        `Extension will not work at all: workspace initialization failed for ${pathToElmJson.toString()}` +
          "For more information, check your extension logs (VSCode: F1 > Output, dropdown on the right, 'Elm (project name)')",
      );
    }
  }

  private async loadRootProject(elmJsonPath: URI): Promise<ElmProject> {
    const elmJson = await this.loadElmJson(elmJsonPath);

    if (elmJson.type === "application") {
      const allDependencies = new Map(
        Object.entries({
          ...elmJson.dependencies.direct,
          ...elmJson.dependencies.indirect,
          ...elmJson["test-dependencies"].direct,
          ...elmJson["test-dependencies"].indirect,
        }).map(([dep, version]) => [dep, utils.parseVersion(version)]),
      );

      return {
        type: "application",
        uri: this.rootPath.toString(),
        sourceDirectories: elmJson["source-directories"].map((folder) =>
          Utils.resolvePath(this.rootPath, folder).toString(),
        ),
        testDirectories: [Utils.joinPath(this.rootPath, "tests").toString()],
        dependencies: await this.loadDependencyMap(
          elmJson.dependencies.direct,
          allDependencies,
        ),
        testDependencies: await this.loadDependencyMap(
          elmJson["test-dependencies"].direct,
          allDependencies,
        ),
        moduleToUriMap: new Map<string, string>(),
        testModuleToUriMap: new Map<string, string>(),
      } as IElmApplication;
    } else {
      const deps = new Map(
        Object.entries(
          Object.assign(elmJson.dependencies, elmJson["test-dependencies"]),
        ).map(([dep, version]) => [dep, utils.parseConstraint(version)]),
      );

      const solvedVersions = await utils.solveDependencies(
        this.elmPackageCache,
        deps,
      );

      if (!solvedVersions) {
        this.connection.window.showErrorMessage(
          "There is a problem with elm.json. Could not solve dependencies with the given constraints. Try running `elm make` to install missing dependencies.",
        );
        throw new Error("Unsolvable package constraints");
      }

      return {
        type: "package",
        uri: this.rootPath.toString(),
        sourceDirectories: [Utils.joinPath(this.rootPath, "src").toString()],
        testDirectories: [Utils.joinPath(this.rootPath, "tests").toString()],
        dependencies: await this.loadDependencyMap(
          elmJson.dependencies,
          solvedVersions,
        ),
        testDependencies: await this.loadDependencyMap(
          elmJson["test-dependencies"],
          solvedVersions,
        ),
        exposedModules: new Set(
          utils.flattenExposedModules(elmJson["exposed-modules"]),
        ),
        moduleToUriMap: new Map<string, string>(),
        maintainerAndPackageName: elmJson.name,
        testModuleToUriMap: new Map<string, string>(),
        isDependency: false,
      } as IElmPackage;
    }
  }

  private async loadPackage(
    packageName: string,
    packageVersions: ReadonlyMap<string, IVersion>,
  ): Promise<IElmPackage> {
    const version = packageVersions.get(packageName);

    if (!version) {
      throw new Error("Problem getting package version");
    }

    // Version shouldn't be necessary, but it won't hurt
    const cacheKey = `${packageName}@${version.string}`;
    const cached = this.resolvedPackageCache.get(cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    const maintainer = packageName.substring(0, packageName.indexOf("/"));
    const name = packageName.substring(
      packageName.indexOf("/") + 1,
      packageName.length,
    );

    const pathToPackageWithVersion = Utils.joinPath(
      ElmPackageCache.packagesRoot,
      `${maintainer}/${name}/${version.string}`,
    );

    const elmJsonPath = Utils.joinPath(pathToPackageWithVersion, "elm.json");
    const elmJson = await this.loadElmJson(elmJsonPath);

    if (elmJson.type === "package") {
      const resolvedPackage = {
        type: "package",
        uri: pathToPackageWithVersion.toString(),
        sourceDirectories: [
          Utils.joinPath(pathToPackageWithVersion, "src").toString(),
        ],
        testDirectories: [
          Utils.joinPath(pathToPackageWithVersion, "tests").toString(),
        ],
        dependencies: await this.loadDependencyMap(
          elmJson.dependencies,
          packageVersions,
        ),
        testDependencies: new Map<string, IElmPackage>(),
        exposedModules: new Set(
          utils.flattenExposedModules(elmJson["exposed-modules"]),
        ),
        moduleToUriMap: new Map<string, string>(),
        maintainerAndPackageName: elmJson.name,
        testModuleToUriMap: new Map<string, string>(),
        isDependency: true,
      } as IElmPackage;

      this.resolvedPackageCache.set(cacheKey, resolvedPackage);
      return resolvedPackage;
    } else {
      throw new Error("Should never happen");
    }
  }

  private async loadDependencyMap(
    deps: {
      [module: string]: string;
    },
    packageVersions: ReadonlyMap<string, IVersion>,
  ): Promise<Map<string, IElmPackage>> {
    const dependencyMap = new Map<string, IElmPackage>();
    for (const dep in deps) {
      dependencyMap.set(dep, await this.loadPackage(dep, packageVersions));
    }
    return dependencyMap;
  }

  /**
   * Get all unique source directories from project dependency tree
   */
  private getSourceDirectories(project: ElmProject): Map<string, ElmProject> {
    const sourceDirs = new Map(
      [
        ...project.sourceDirectories,
        ...(project === this.rootProject ? project.testDirectories : []),
      ].map((sourceDir) => [URI.parse(sourceDir).toString(), project]),
    );

    project.dependencies.forEach((dep) =>
      this.getSourceDirectories(dep).forEach((project, sourceDir) =>
        sourceDirs.set(sourceDir, project),
      ),
    );

    if (project === this.rootProject) {
      project.testDependencies.forEach((dep) =>
        this.getSourceDirectories(dep).forEach((project, sourceDir) =>
          sourceDirs.set(sourceDir, project),
        ),
      );
    }

    return sourceDirs;
  }

  private async findElmFilesInProject(
    project: ElmProject,
    progressCallback: (progress: number) => void,
  ): Promise<IElmFile[]> {
    const elmFilePathPromises: Promise<IElmFile[]>[] = [];

    const sourceDirectories = this.getSourceDirectories(project);

    const progressDelta = 100 / sourceDirectories.size;
    sourceDirectories.forEach((project, sourceDir) => {
      elmFilePathPromises.push(
        this.findElmFilesInProjectWorker(URI.parse(sourceDir), project).then(
          (data) => {
            progressCallback(progressDelta);
            return data;
          },
        ),
      );
    });

    const elmFiles = (await Promise.all(elmFilePathPromises)).flatMap((a) => a);
    this.findExposedModulesOfDependencies(project);

    // If we have a tree, then it means it is a package that we need to check for internal dependencies
    const unresolvedFiles = elmFiles.filter((elmFile) => elmFile.tree);
    while (unresolvedFiles.length > 0) {
      const elmFile = unresolvedFiles.shift();

      if (!elmFile || !elmFile.tree) {
        this.connection.console.error(
          "Unexpected error occurred while resolving internal dependencies",
        );
        continue;
      }

      const promies = elmFile.tree.rootNode.children
        .filter((a) => a.type === "import_clause")
        .map((imp) => imp.childForFieldName("moduleName"))
        .map(async (moduleNode) => {
          if (!moduleNode) {
            return;
          }

          const moduleName = moduleNode.text;

          // Only package projects can have unresolved internal dependencies
          const project = elmFile.project;
          if (
            project.type === "package" &&
            !project.moduleToUriMap.has(moduleName)
          ) {
            // We need to try for each source directory, but only 1 will work
            for (const sourceDir of project.sourceDirectories) {
              const elmFile = await this.tryAddModule(
                moduleName,
                URI.parse(sourceDir),
                project,
              );

              if (elmFile) {
                elmFiles.push(elmFile);

                // Kernel files won't have a tree and don't need further processing
                if (elmFile.tree) {
                  unresolvedFiles.push(elmFile);
                }
              }
            }
          }
        });

      await Promise.all(promies);
    }

    return elmFiles;
  }

  private async findElmFilesInProjectWorker(
    sourceDir: URI,
    project: ElmProject,
  ): Promise<IElmFile[]> {
    const elmFiles: IElmFile[] = [];

    const maintainerAndPackageName =
      project.type === "package" ? project.maintainerAndPackageName : undefined;

    const isDependency =
      project.type === "package" ? project.isDependency : false;

    this.connection.console.info(`Glob ${sourceDir.toString()}/**/*.elm`);

    // If it is a virtual package then we can't find elm files using glob
    // We need to use the exposed modules and then for each file follow the imports to find internal modules
    // We do this in the findElmFilesInProject after we have loaded all the initial files
    if (project.type === "package" && sourceDir.scheme === "elm-virtual-file") {
      const promises = Array.from(project.exposedModules.values()).map(
        async (moduleName) => {
          const elmFile = await this.tryAddModule(
            moduleName,
            sourceDir,
            project,
          );
          if (elmFile) {
            elmFiles.push(elmFile);
          }
        },
      );

      await Promise.all(promises);
    } else {
      (
        await this.host.readDirectory(sourceDir, /* include */ "**/*.elm")
      ).forEach((elmFilePath) => {
        const moduleName = utils.getModuleName(
          elmFilePath.toString(),
          sourceDir.toString(),
        );

        const isTestFile =
          project.type === "application" &&
          (this.getSourceDirectoryOfFile(elmFilePath.toString())?.endsWith(
            "tests",
          ) ??
            false);

        if (isTestFile) {
          project.testModuleToUriMap.set(moduleName, elmFilePath.toString());
        } else {
          project.moduleToUriMap.set(moduleName, elmFilePath.toString());
        }

        elmFiles.push({
          maintainerAndPackageName,
          path: elmFilePath,
          project,
          isTestFile,
          isDependency,
          isKernel: false,
        });
      });
    }

    return elmFiles;
  }

  private async tryAddModule(
    moduleName: string,
    sourceDir: URI,
    project: IElmPackage,
  ): Promise<IElmFile | undefined> {
    const modulePath = utils.getModuleUri(moduleName, sourceDir, project);

    try {
      const fileContent = await this.host.readFile(modulePath);

      project.moduleToUriMap.set(moduleName, modulePath.toString());

      const isKernel = modulePath.toString().endsWith(".js");

      return {
        maintainerAndPackageName: project.maintainerAndPackageName,
        path: modulePath,
        project,
        isTestFile: false,
        isDependency: true,
        tree: isKernel ? undefined : this.parser.parse(fileContent),
        isKernel,
        moduleName,
      };
    } catch (e) {
      // The module might be in another source directory
    }
  }

  private async readAndAddToForest(elmFile: IElmFile): Promise<void> {
    try {
      const uri = elmFile.path.toString();
      this.connection.console.info(`Adding ${uri}`);

      if (elmFile.isKernel) {
        this.forest.setKernelSourceFile(
          uri,
          elmFile.project,
          elmFile.maintainerAndPackageName ?? "",
          elmFile.moduleName ?? "",
        );
      } else {
        const tree =
          elmFile.tree ??
          this.parser.parse(await this.host.readFile(elmFile.path));
        this.forest.setSourceFile(
          uri,
          elmFile.project === this.rootProject,
          tree,
          elmFile.isTestFile,
          elmFile.isDependency,
          elmFile.project,
          elmFile.maintainerAndPackageName,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.stack) {
        this.connection.console.error(error.stack);
      }
    }
  }

  private findExposedModulesOfDependencies(project: ElmProject): void {
    // For each dependency, find every exposed module
    project.dependencies.forEach((dep) => {
      dep.moduleToUriMap.forEach((uri, module) => {
        if (dep.exposedModules.has(module)) {
          project.moduleToUriMap.set(module, uri);
        }
      });
      this.findExposedModulesOfDependencies(dep);
    });

    if (project === this.rootProject) {
      project.testDependencies.forEach((dep) => {
        dep.moduleToUriMap.forEach((uri, module) => {
          if (dep.exposedModules.has(module)) {
            project.testModuleToUriMap.set(module, uri);
          }
        });
        this.findExposedModulesOfDependencies(dep);
      });
    }
  }

  private async loadElmJson(elmJsonPath: URI): Promise<ElmJson> {
    return JSON.parse(await this.host.readFile(elmJsonPath)) as ElmJson;
  }
}
