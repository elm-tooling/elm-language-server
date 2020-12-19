import { readdir } from "fs";
import * as utils from "./util/elmUtils";
import { ElmJson } from "./elmWorkspace";
import { promisify } from "util";
import { IConstraint, IVersion } from "./util/elmUtils";

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
}

export class ElmPackageCache implements IElmPackageCache {
  private versionsCache = new Map<string, IVersion[]>();
  private dependenciesCache = new Map<string, Map<string, IConstraint>>();

  constructor(
    private packagesRoot: string,
    private loadElmJson: (elmJsonPath: string) => Promise<ElmJson>,
  ) {}

  public async getVersions(packageName: string): Promise<IVersion[]> {
    const cached = this.versionsCache.get(packageName);

    if (cached) {
      return cached;
    }

    const versions = await this.getVersionsFromFileSystem(packageName);

    this.versionsCache.set(packageName, versions);

    return versions;
  }

  public async getDependencies(
    packageName: string,
    version: IVersion,
  ): Promise<Map<string, IConstraint>> {
    const cacheKey = `${packageName}@${version.string}`;
    const cached = this.dependenciesCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const dependencies = await this.getDependenciesFromFileSystem(
      packageName,
      version,
    );

    this.dependenciesCache.set(cacheKey, dependencies);

    return dependencies;
  }

  private async getVersionsFromFileSystem(
    packageName: string,
  ): Promise<IVersion[]> {
    const maintainer = packageName.substring(0, packageName.indexOf("/"));
    const name = packageName.substring(
      packageName.indexOf("/") + 1,
      packageName.length,
    );

    const pathToPackage = `${this.packagesRoot}${maintainer}/${name}/`;
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
    const elmJsonPath = `${this.packagesRoot}${packageName}/${version.string}/elm.json`;
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
