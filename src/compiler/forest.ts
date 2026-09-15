import { Node as SyntaxNode, Tree } from "web-tree-sitter";
import { Imports } from "./imports.js";
import { TreeUtils } from "../common/util/treeUtils.js";
import { SyntaxNodeMap } from "./utils/syntaxNodeMap.js";
import { IExposing, SymbolMap } from "./binder.js";
import { Diagnostic } from "./diagnostics.js";
import { ElmProject } from "./program.js";

export interface ISourceFile {
  uri: string;
  writeable: boolean;
  maintainerAndPackageName?: string;
  tree: Tree;
  project: ElmProject; // The project this source file is associated with
  isTestFile: boolean;
  isDependency: boolean;

  parseDiagnostics: Diagnostic[];
  bindDiagnostics: Diagnostic[];

  // These are resolved in the synchronize step and are cached until the file is changed
  moduleName?: string;
  resolvedModules?: Map<string, string>; // Map of modules to uris

  // Resolved during binding
  exposing?: IExposing;
  symbolLinks?: SyntaxNodeMap<SyntaxNode, SymbolMap>;
  nonShadowableNames?: Set<string>; // Top level function names
  portAnnotations?: readonly SyntaxNode[];

  // This is resolved while getting semantic diagnostics and defines whether we have loaded all import files
  resolvedImports?: boolean;
}

export interface IKernelSourceFile {
  uri: string;
  maintainerAndPackageName: string;
  project: ElmProject;
  moduleName: string;
}

export interface IForest {
  readonly sourceFiles: Map<string, ISourceFile>;
  getTree(uri: string): Tree | undefined;
  getByUri(uri: string): ISourceFile | undefined;
  getDependencyUris(uri: string): readonly string[];
  getImportingModules(uri: string): ISourceFile[];
  setSourceFile(
    uri: string,
    writeable: boolean,
    tree: Tree,
    isTestFile: boolean,
    isDependency: boolean,
    project?: ElmProject,
    maintainerAndPackageName?: string,
  ): ISourceFile;
  removeTree(uri: string): void;
  synchronize(): void;
  invalidateResolvedModules(): void;
  setKernelSourceFile(
    uri: string,
    project: ElmProject,
    maintainerAndPackageName: string,
    moduleName: string,
  ): IKernelSourceFile;
  getKernelSourceFile(uri: string): IKernelSourceFile | undefined;
}

export class Forest implements IForest {
  public sourceFiles = new Map<string, ISourceFile>();
  private kernelSourceFiles = new Map<string, IKernelSourceFile>();
  private dependencies = new Map<string, Set<string>>();
  private importingModules = new Map<string, Set<string>>();

  constructor(private rootProject: ElmProject) {}

  public getTree(uri: string): Tree | undefined {
    return this.getByUri(uri)?.tree;
  }

  public getByUri(uri: string): ISourceFile | undefined {
    return this.sourceFiles.get(uri);
  }

  // Keep the last synchronized edges available while a changed tree is unbound.
  public getDependencyUris(uri: string): readonly string[] {
    return [...(this.dependencies.get(uri) ?? [])];
  }

  public getImportingModules(uri: string): ISourceFile[] {
    return [...(this.importingModules.get(uri) ?? [])].flatMap((importer) => {
      const sourceFile = this.sourceFiles.get(importer);
      return sourceFile ? [sourceFile] : [];
    });
  }

  public setSourceFile(
    uri: string,
    writeable: boolean,
    tree: Tree,
    isTestFile: boolean,
    isDependency: boolean,
    project: ElmProject = this.rootProject,
    maintainerAndPackageName?: string,
  ): ISourceFile {
    const existingSourceFile = this.sourceFiles.get(uri);
    if (existingSourceFile) {
      this.removeUriFromModuleMaps(existingSourceFile);
    }

    // Kernel sources do not have trees
    if (tree) {
      tree.uri = uri;
    }

    const sourceFile: ISourceFile = {
      maintainerAndPackageName,
      tree,
      uri,
      writeable,
      project,
      isTestFile,
      isDependency,
      parseDiagnostics: [],
      bindDiagnostics: [],
    };

    this.sourceFiles.set(uri, sourceFile);

    return sourceFile;
  }

  public removeTree(uri: string): void {
    const sourceFile = this.sourceFiles.get(uri);

    if (sourceFile) {
      this.removeUriFromModuleMaps(sourceFile);
      this.sourceFiles.delete(uri);
      this.updateDependencies(uri, new Set());
      this.dependencies.delete(uri);
    }
  }

  public synchronize(): void {
    let moduleMapsChanged = false;
    this.sourceFiles.forEach((sourceFile) => {
      if (!sourceFile.tree) {
        return;
      }

      if (!sourceFile.moduleName) {
        const moduleName = TreeUtils.getModuleNameNode(sourceFile.tree)?.text;

        if (moduleName) {
          sourceFile.moduleName = moduleName;

          if (
            sourceFile.project === this.rootProject &&
            !this.getModuleMap(sourceFile).has(moduleName)
          ) {
            this.getModuleMap(sourceFile).set(moduleName, sourceFile.uri);
            moduleMapsChanged = true;
          }
        }
      }
    });

    if (moduleMapsChanged) {
      this.invalidateResolvedModules();
    }

    // Register all module names before resolving imports, including new files.
    this.sourceFiles.forEach((sourceFile) => {
      if (sourceFile.tree && !sourceFile.resolvedModules) {
        sourceFile.resolvedModules = this.resolveModules(sourceFile);
        this.updateDependencies(
          sourceFile.uri,
          new Set(sourceFile.resolvedModules.values()),
        );
      }
    });
  }

  private updateDependencies(uri: string, dependencies: Set<string>): void {
    for (const previous of this.dependencies.get(uri) ?? []) {
      const importers = this.importingModules.get(previous);
      importers?.delete(uri);
      if (importers?.size === 0) {
        this.importingModules.delete(previous);
      }
    }

    this.dependencies.set(uri, dependencies);
    for (const dependency of dependencies) {
      let importers = this.importingModules.get(dependency);
      if (!importers) {
        importers = new Set();
        this.importingModules.set(dependency, importers);
      }
      importers.add(uri);
    }
  }

  public invalidateResolvedModules(): void {
    this.sourceFiles.forEach((sourceFile) => {
      sourceFile.resolvedModules = undefined;
    });
  }

  public setKernelSourceFile(
    uri: string,
    project: ElmProject,
    maintainerAndPackageName: string,
    moduleName: string,
  ): IKernelSourceFile {
    const sourceFile = {
      uri,
      project,
      maintainerAndPackageName,
      moduleName,
    };
    this.kernelSourceFiles.set(uri, sourceFile);
    return sourceFile;
  }

  public getKernelSourceFile(uri: string): IKernelSourceFile | undefined {
    return this.kernelSourceFiles.get(uri);
  }

  private resolveModules(sourceFile: ISourceFile): Map<string, string> {
    const importClauses = [
      ...Imports.getVirtualImports(),
      ...(TreeUtils.findAllImportClauseNodes(sourceFile.tree) ?? []),
    ];

    const resolvedModules = new Map<string, string>();

    importClauses.forEach((importClause) => {
      const moduleName =
        TreeUtils.getModuleNameNodeFromImportClause(importClause)?.text;

      if (moduleName) {
        let found = sourceFile.project.moduleToUriMap.get(moduleName);

        if (!found && sourceFile.isTestFile) {
          found = sourceFile.project.testModuleToUriMap.get(moduleName);
        }

        if (found) {
          resolvedModules.set(moduleName, found);
        }
      }
    });

    return resolvedModules;
  }

  private getModuleMap(sourceFile: ISourceFile): Map<string, string> {
    return sourceFile.isTestFile
      ? sourceFile.project.testModuleToUriMap
      : sourceFile.project.moduleToUriMap;
  }

  private removeUriFromModuleMaps(sourceFile: ISourceFile): void {
    let removed = false;

    const removeFromMap = (moduleMap: Map<string, string>): void => {
      moduleMap.forEach((mappedUri, moduleName) => {
        if (mappedUri === sourceFile.uri) {
          moduleMap.delete(moduleName);
          removed = true;
        }
      });
    };

    removeFromMap(sourceFile.project.moduleToUriMap);
    removeFromMap(sourceFile.project.testModuleToUriMap);

    if (removed) {
      this.invalidateResolvedModules();
    }
  }
}
