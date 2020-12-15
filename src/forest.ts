import { SyntaxNode, Tree } from "web-tree-sitter";
import { Imports } from "./imports";
import { IExposing, TreeUtils } from "./util/treeUtils";
import { SyntaxNodeMap } from "./util/types/syntaxNodeMap";
import { SymbolMap } from "./util/types/binder";
import { Diagnostic } from "./util/types/diagnostics";
import { ElmProject } from "./elmWorkspace";

export interface ITreeContainer {
  uri: string;
  writeable: boolean;
  referenced: boolean;
  maintainerAndPackageName?: string;
  tree: Tree;
  project: ElmProject; // The project this source file is associated with

  parseDiagnostics: Diagnostic[];

  // These are resolved in the synchronize step and are cached until the file is changed
  moduleName?: string;
  resolvedModules?: Map<string, string>; // Map of modules to uris

  // Resolved during binding
  exposing?: IExposing;
  symbolLinks?: SyntaxNodeMap<SyntaxNode, SymbolMap>;
  nonShadowableNames?: Set<string>; // Top level function names
}

export interface IForest {
  treeMap: Map<string, ITreeContainer>;
  getTree(uri: string): Tree | undefined;
  getByModuleName(moduleName: string): ITreeContainer | undefined;
  getByUri(uri: string): ITreeContainer | undefined;
  setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: Tree,
    project?: ElmProject,
    packageName?: string,
  ): ITreeContainer;
  removeTree(uri: string): void;
  synchronize(): void;
  invalidateResolvedModules(): void;
}

export class Forest implements IForest {
  public treeMap: Map<string, ITreeContainer> = new Map<
    string,
    ITreeContainer
  >();

  constructor(private rootProject: ElmProject) {}

  public getTree(uri: string): Tree | undefined {
    return this.getByUri(uri)?.tree;
  }

  public getByModuleName(moduleName: string): ITreeContainer | undefined {
    return this.getByUri(this.rootProject.moduleToUriMap.get(moduleName) ?? "");
  }

  public getByUri(uri: string): ITreeContainer | undefined {
    return this.treeMap.get(uri);
  }

  public setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: Tree,
    project: ElmProject = this.rootProject,
    maintainerAndPackageName?: string,
  ): ITreeContainer {
    tree.uri = uri;

    const treeContainer: ITreeContainer = {
      maintainerAndPackageName,
      referenced,
      tree,
      uri,
      writeable,
      project,
      parseDiagnostics: [],
    };

    this.treeMap.set(uri, treeContainer);

    return treeContainer;
  }

  public removeTree(uri: string): void {
    this.treeMap.delete(uri);
  }

  public synchronize(): void {
    this.treeMap.forEach((treeContainer) => {
      // Resolve import modules
      if (!treeContainer.resolvedModules) {
        treeContainer.resolvedModules = this.resolveModules(treeContainer);
      }

      if (!treeContainer.moduleName) {
        const moduleName = TreeUtils.getModuleNameNode(treeContainer.tree)
          ?.text;

        if (moduleName) {
          treeContainer.moduleName = moduleName;

          if (
            treeContainer.project === this.rootProject &&
            !this.rootProject.moduleToUriMap.has(moduleName)
          ) {
            this.rootProject.moduleToUriMap.set(moduleName, treeContainer.uri);
          }
        }
      }
    });
  }

  public invalidateResolvedModules(): void {
    this.treeMap.forEach((treeContainer) => {
      treeContainer.resolvedModules = undefined;
    });
  }

  private resolveModules(sourceFile: ITreeContainer): Map<string, string> {
    const importClauses = [
      ...Imports.getVirtualImports(),
      ...(TreeUtils.findAllImportClauseNodes(sourceFile.tree) ?? []),
    ];

    const resolvedModules = new Map<string, string>();

    importClauses.forEach((importClause) => {
      const moduleName = importClause.childForFieldName("moduleName")?.text;

      if (moduleName) {
        const found = sourceFile.project.moduleToUriMap.get(moduleName);

        if (found) {
          resolvedModules.set(moduleName, found);
        }
      }
    });

    return resolvedModules;
  }
}
