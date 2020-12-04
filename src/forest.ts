import { SyntaxNode, Tree } from "web-tree-sitter";
import { IRootFolder } from "./elmWorkspace";
import { Imports } from "./imports";
import { IExposing, TreeUtils } from "./util/treeUtils";
import * as path from "path";
import { existsSync } from "fs";
import { URI } from "vscode-uri";
import { SyntaxNodeMap } from "./util/types/syntaxNodeMap";
import { SymbolMap } from "./util/types/binder";
import { Diagnostic } from "./util/types/diagnostics";

export interface ITreeContainer {
  uri: string;
  writeable: boolean;
  referenced: boolean;
  maintainerAndPackageName?: string;
  tree: Tree;
  isExposed: boolean; // Is this file exposed by the elm.json

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
    isExposed: boolean,
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
  public moduleToUrisMap: Map<string, string[]> = new Map<string, string[]>();

  private elmFolders: { uri: string; writeable: boolean }[] = [];

  constructor(elmFolders: ReadonlyMap<string, IRootFolder>) {
    elmFolders.forEach(({ writeable }, uri) =>
      this.elmFolders.push({ writeable, uri }),
    );
  }

  public getTree(uri: string): Tree | undefined {
    return this.getByUri(uri)?.tree;
  }

  public getByModuleName(moduleName: string): ITreeContainer | undefined {
    return this.moduleToUrisMap
      .get(moduleName)
      ?.map(this.getByUri.bind(this))
      .sort((x, y) => {
        return x?.isExposed === y?.isExposed ? 0 : x?.isExposed ? -1 : 1;
      })[0];
  }

  public getByUri(uri: string): ITreeContainer | undefined {
    return this.treeMap.get(uri);
  }

  public setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: Tree,
    isExposed: boolean,
    maintainerAndPackageName?: string,
  ): ITreeContainer {
    tree.uri = uri;

    const treeContainer: ITreeContainer = {
      maintainerAndPackageName,
      referenced,
      tree,
      uri,
      writeable,
      isExposed,
      parseDiagnostics: [],
    };

    this.treeMap.set(uri, treeContainer);

    return treeContainer;
  }

  public removeTree(uri: string): void {
    const existing = this.getByUri(uri);
    if (existing && existing.moduleName) {
      this.deleteModuleFromUriMap(existing.moduleName, uri);
    }

    this.treeMap.delete(uri);
  }

  public synchronize(): void {
    this.treeMap.forEach((treeContainer, uri) => {
      // Resolve import modules
      if (!treeContainer.resolvedModules) {
        treeContainer.resolvedModules = this.resolveModules(treeContainer);
      }

      if (!treeContainer.moduleName) {
        const moduleName = TreeUtils.getModuleNameNode(treeContainer.tree)
          ?.text;

        if (moduleName) {
          treeContainer.moduleName = moduleName;
          this.addModuleToUriMap(moduleName, uri);
        }
      }
    });
  }

  public invalidateResolvedModules(): void {
    this.treeMap.forEach((treeContainer) => {
      treeContainer.resolvedModules = undefined;
    });
  }

  private resolveModules(treeContainer: ITreeContainer): Map<string, string> {
    const importClauses = [
      ...Imports.getVirtualImports(),
      ...(TreeUtils.findAllImportClauseNodes(treeContainer.tree) ?? []),
    ];

    const resolvedModules = new Map<string, string>();

    // It should be faster to look directly at elmFolders instead of traversing the forest
    importClauses.forEach((importClause) => {
      const moduleName = importClause.childForFieldName("moduleName")?.text;

      if (moduleName) {
        const modulePath = moduleName.split(".").join("/") + ".elm";
        const found = this.elmFolders.find((folder) =>
          existsSync(
            path.join(
              !folder.writeable ? folder.uri + "/src" : folder.uri,
              modulePath,
            ),
          ),
        );

        if (found) {
          resolvedModules.set(
            moduleName,
            URI.file(
              path.join(
                !found.writeable ? found.uri + "/src" : found.uri,
                modulePath,
              ),
            ).toString(),
          );
        }
      }
    });

    return resolvedModules;
  }

  private addModuleToUriMap(module: string, uri: string): void {
    const existing = this.moduleToUrisMap.get(module);

    if (existing) {
      if (!existing.includes(uri)) {
        existing.push(uri);
      }
    } else {
      this.moduleToUrisMap.set(module, [uri]);
    }
  }

  private deleteModuleFromUriMap(module: string, uri: string): void {
    const existing = this.moduleToUrisMap.get(module);

    if (existing) {
      existing.splice(existing.indexOf(uri), 1);
    }
  }
}
