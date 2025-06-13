import { Node, Tree } from "web-tree-sitter";
import { Imports } from "./imports";
import { TreeUtils } from "../common/util/treeUtils";
import { SyntaxNodeMap } from "./utils/syntaxNodeMap";
import { IExposing, SymbolMap } from "./binder";
import { Diagnostic } from "./diagnostics";
import { ElmProject } from "./program";

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
  symbolLinks?: SyntaxNodeMap<Node, SymbolMap>;
  nonShadowableNames?: Set<string>; // Top level function names

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

  constructor(private rootProject: ElmProject) {}

  public getTree(uri: string): Tree | undefined {
    return this.getByUri(uri)?.tree;
  }

  public getByUri(uri: string): ISourceFile | undefined {
    return this.sourceFiles.get(uri);
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
    this.sourceFiles.delete(uri);
  }

  public synchronize(): void {
    this.sourceFiles.forEach((sourceFile) => {
      if (!sourceFile.tree) {
        return;
      }

      // Resolve import modules
      if (!sourceFile.resolvedModules) {
        sourceFile.resolvedModules = this.resolveModules(sourceFile);
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
          }
        }
      }
    });
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
      const moduleName = importClause.childForFieldName("moduleName")?.text;

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
}
