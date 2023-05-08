import * as utils from "./utils/elmUtils";
import { ElmJson, IProgramHost } from "./program";
import { IConstraint, IVersion } from "./utils/elmUtils";
import { MultiMap } from "../util/multiMap";
import { URI, Utils } from "vscode-uri";

export interface IPackage {
  dependencies: Map<string, IConstraint>;
  version: IVersion;
}

export interface IElmPackageCache {
  getVersions(packageName: string): Promise<IVersion[]>;
  getDependencies(
    packageName: string,
    version: IVersion,
  ): Promise<Map<string, IConstraint>>;
  loadAllPackageModules(): Promise<void>;
}

export class ElmPackageCache implements IElmPackageCache {
  private static versionsCache = new Map<string, IVersion[]>();
  private static dependenciesCache = new Map<
    string,
    Map<string, IConstraint>
  >();
  private static moduleToPackages = new MultiMap<string, string>();

  private static _packagesRoot: URI;
  private static allPackagesFromWebsite: {
    [packageNameAndMaintainer: string]: string[];
  };

  public static set packagesRoot(newPackagesRoot: URI) {
    // If we somehow got a different packages root (they changed elm versions and restarted the server)
    // Clear all caches
    if (this._packagesRoot?.toString() !== newPackagesRoot.toString()) {
      this.versionsCache.clear();
      this.dependenciesCache.clear();
      this.moduleToPackages.clear();
      this._packagesRoot = newPackagesRoot;
    }
  }

  public static get packagesRoot(): URI {
    return this._packagesRoot;
  }

  constructor(
    private loadElmJson: (elmJsonPath: URI) => Promise<ElmJson>,
    private host: IProgramHost,
  ) {}

  public async getVersions(packageName: string): Promise<IVersion[]> {
    const cached = ElmPackageCache.versionsCache.get(packageName);

    if (cached) {
      return cached;
    }

    const versions =
      ElmPackageCache.packagesRoot.scheme === "file"
        ? await this.getVersionsFromFileSystem(packageName)
        : await this.getVersionsFromWebsite(packageName);

    ElmPackageCache.versionsCache.set(packageName, versions);

    return versions;
  }

  public async getDependencies(
    packageName: string,
    version: IVersion,
  ): Promise<Map<string, IConstraint>> {
    const cacheKey = `${packageName}@${version.string}`;
    const cached = ElmPackageCache.dependenciesCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const dependencies = await this.getDependenciesWorker(packageName, version);

    ElmPackageCache.dependenciesCache.set(cacheKey, dependencies);

    return dependencies;
  }

  public async loadAllPackageModules(): Promise<void> {
    if (ElmPackageCache.moduleToPackages.size > 0) {
      // Don't load twice
      return;
    }

    // Don't load if we're not using a file system
    if (
      !ElmPackageCache._packagesRoot ||
      ElmPackageCache._packagesRoot.scheme !== "file"
    ) {
      return;
    }

    try {
      const maintainers = await this.host.readDirectory(
        ElmPackageCache._packagesRoot,
        undefined,
        /* depth */ 1,
      );

      for (const maintainer of maintainers) {
        try {
          const maintainerName = Utils.basename(maintainer);
          const packages = await this.host.readDirectory(
            Utils.joinPath(ElmPackageCache._packagesRoot, maintainerName),
            undefined,
            /* depth */ 1,
          );

          for (const packagePath of packages) {
            try {
              const packageAndMaintainer = `${maintainerName}/${Utils.basename(
                packagePath,
              )}`;
              const versions = await this.getVersions(packageAndMaintainer);

              const latestVersion = versions[versions.length - 1];

              const elmJsonPath = Utils.joinPath(
                ElmPackageCache._packagesRoot,
                `${packageAndMaintainer}/${latestVersion.string}/elm.json`,
              );
              const elmJson = await this.loadElmJson(elmJsonPath);

              if (elmJson.type === "package") {
                const exposedModules = utils.flattenExposedModules(
                  elmJson["exposed-modules"],
                );

                exposedModules.forEach((exposedModule) => {
                  ElmPackageCache.moduleToPackages.set(
                    exposedModule,
                    packageAndMaintainer,
                  );
                });
              }
            } catch {
              // Could fail if `packageName` is not a directory
            }
          }
        } catch {
          // Could fail if `maintainer` is not a directory (elm cache files)
        }
      }
    } catch {
      // Could fail if packages root is invalid
    }
  }

  public static getPackagesWithModule(moduleName: string): string[] {
    return this.moduleToPackages.getAll(moduleName) ?? [];
  }

  private async getVersionsFromFileSystem(
    packageName: string,
  ): Promise<IVersion[]> {
    const maintainer = packageName.substring(0, packageName.indexOf("/"));
    const name = packageName.substring(
      packageName.indexOf("/") + 1,
      packageName.length,
    );

    const pathToPackage = Utils.joinPath(
      ElmPackageCache._packagesRoot,
      `${maintainer}/${name}/`,
    );
    const folders = await this.host.readDirectory(
      pathToPackage,
      undefined,
      /* depth */ 1,
    );

    const allVersions: IVersion[] = [];

    for (const folder of folders) {
      const version = utils.parseVersion(Utils.basename(folder));

      if (
        Number.isInteger(version.major) &&
        Number.isInteger(version.minor) &&
        Number.isInteger(version.patch)
      ) {
        allVersions.push(version);
      }
    }

    return allVersions;
  }

  private async getVersionsFromWebsite(
    packageName: string,
  ): Promise<IVersion[]> {
    const maintainer = packageName.substring(0, packageName.indexOf("/"));
    const name = packageName.substring(
      packageName.indexOf("/") + 1,
      packageName.length,
    );

    if (!ElmPackageCache.allPackagesFromWebsite) {
      ElmPackageCache.allPackagesFromWebsite = JSON.parse(
        await this.host.readFile(
          URI.parse("https://package.elm-lang.org/all-packages/"),
        ),
      ) as { [packageNameAndMaintainer: string]: string[] };
    }

    return ElmPackageCache.allPackagesFromWebsite[`${maintainer}/${name}`].map(
      (version) => utils.parseVersion(version),
    );
  }

  private async getDependenciesWorker(
    packageName: string,
    version: IVersion,
  ): Promise<Map<string, IConstraint>> {
    const elmJsonPath = Utils.joinPath(
      ElmPackageCache._packagesRoot,
      `${packageName}/${version.string}/elm.json`,
    );
    const elmJson = await this.loadElmJson(elmJsonPath);

    return this.parseDependencies(elmJson);
  }

  private parseDependencies(elmJson: ElmJson): Map<string, IConstraint> {
    return new Map<string, IConstraint>(
      Object.entries(elmJson.dependencies).map(([name, constraint]) => [
        name,
        utils.parseConstraint(constraint as string),
      ]),
    );
  }
}
