import { SyntaxNode, Tree } from "web-tree-sitter";
import { Imports } from "./imports";
import { TreeUtils } from "../util/treeUtils";
import { SyntaxNodeMap } from "./utils/syntaxNodeMap";
import { IExposing, SymbolMap } from "./binder";
import { Diagnostic } from "./diagnostics";
import { ElmProject } from "./program";

export interface ISourceFile {
  uri: string;
  writeable: boolean;
  referenced: boolean;
  maintainerAndPackageName?: string;
  tree: Tree;
  project: ElmProject; // The project this source file is associated with
  isTestFile: boolean;

  parseDiagnostics: Diagnostic[];
  bindDiagnostics: Diagnostic[];

  // These are resolved in the synchronize step and are cached until the file is changed
  moduleName?: string;
  resolvedModules?: Map<string, string>; // Map of modules to uris

  // Resolved during binding
  exposing?: IExposing;
  symbolLinks?: SyntaxNodeMap<SyntaxNode, SymbolMap>;
  nonShadowableNames?: Set<string>; // Top level function names
}

export interface IForest {
  treeMap: Map<string, ISourceFile>;
  getTree(uri: string): Tree | undefined;
  getByUri(uri: string): ISourceFile | undefined;
  setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: Tree,
    isTestFile: boolean,
    project?: ElmProject,
    packageName?: string,
  ): ISourceFile;
  removeTree(uri: string): void;
  synchronize(): void;
  invalidateResolvedModules(): void;
}

export class Forest implements IForest {
  public treeMap: Map<string, ISourceFile> = new Map<string, ISourceFile>();

  constructor(private rootProject: ElmProject) {}

  public getTree(uri: string): Tree | undefined {
    return this.getByUri(uri)?.tree;
  }

  public getByUri(uri: string): ISourceFile | undefined {
    return this.treeMap.get(uri);
  }

  public setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: Tree,
    isTestFile: boolean,
    project: ElmProject = this.rootProject,
    maintainerAndPackageName?: string,
  ): ISourceFile {
    tree.uri = uri;

    const sourceFile: ISourceFile = {
      maintainerAndPackageName,
      referenced,
      tree,
      uri,
      writeable,
      project,
      isTestFile,
      parseDiagnostics: [],
      bindDiagnostics: [],
    };

    this.treeMap.set(uri, sourceFile);

    return sourceFile;
  }

  public removeTree(uri: string): void {
    this.treeMap.delete(uri);
  }

  public synchronize(): void {
    this.treeMap.forEach((sourceFile) => {
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
    this.treeMap.forEach((sourceFile) => {
      sourceFile.resolvedModules = undefined;
    });
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
