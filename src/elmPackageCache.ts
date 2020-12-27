import { readdir } from "fs";
import * as utils from "./util/elmUtils";
import { ElmJson } from "./program";
import { promisify } from "util";
import { IConstraint, IVersion } from "./util/elmUtils";
import { MultiMap } from "./util/multiMap";
import * as path from "./util/path";

const readDir = promisify(readdir);

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

  private static _packagesRoot: string;

  public static set packagesRoot(newPackagesRoot: string) {
    // If we somehow got a different packages root (they changed elm versions and restarted the server)
    // Clear all caches
    if (this._packagesRoot !== newPackagesRoot) {
      this.versionsCache.clear();
      this.dependenciesCache.clear();
      this.moduleToPackages.clear();
      this._packagesRoot = newPackagesRoot;
    }
  }

  public static get packagesRoot(): string {
    return this._packagesRoot;
  }

  constructor(private loadElmJson: (elmJsonPath: string) => Promise<ElmJson>) {}

  public async getVersions(packageName: string): Promise<IVersion[]> {
    const cached = ElmPackageCache.versionsCache.get(packageName);

    if (cached) {
      return cached;
    }

    const versions = await this.getVersionsFromFileSystem(packageName);

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

    const dependencies = await this.getDependenciesFromFileSystem(
      packageName,
      version,
    );

    ElmPackageCache.dependenciesCache.set(cacheKey, dependencies);

    return dependencies;
  }

  public async loadAllPackageModules(): Promise<void> {
    if (ElmPackageCache.moduleToPackages.size > 0) {
      // Don't load twice
      return;
    }

    try {
      const maintainers = await readDir(ElmPackageCache._packagesRoot, "utf8");

      for (const maintainer of maintainers) {
        try {
          const packages = await readDir(
            path.join(ElmPackageCache._packagesRoot, maintainer),
          );

          for (const packageName of packages) {
            try {
              const packageAndMaintainer = `${maintainer}/${packageName}`;
              const versions = await this.getVersions(packageAndMaintainer);

              const latestVersion = versions[versions.length - 1];

              const elmJsonPath = `${ElmPackageCache._packagesRoot}${packageAndMaintainer}/${latestVersion.string}/elm.json`;
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

    const pathToPackage = `${ElmPackageCache._packagesRoot}${maintainer}/${name}/`;
    const folders = await readDir(pathToPackage, "utf8");

    const allVersions: IVersion[] = [];

    for (const folderName of folders) {
      const version = utils.parseVersion(folderName);

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

  private async getDependenciesFromFileSystem(
    packageName: string,
    version: IVersion,
  ): Promise<Map<string, IConstraint>> {
    const elmJsonPath = `${ElmPackageCache._packagesRoot}${packageName}/${version.string}/elm.json`;
    const elmJson = await this.loadElmJson(elmJsonPath);

    return this.parseDependencies(elmJson);
  }

  private parseDependencies(elmJson: ElmJson): Map<string, IConstraint> {
    return new Map<string, IConstraint>(
      Object.entries(elmJson.dependencies).map(([name, constraint]) => [
        name,
        utils.parseConstraint(constraint),
      ]),
    );
  }
}
