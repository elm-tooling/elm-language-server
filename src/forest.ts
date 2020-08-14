import { readFileSync } from "fs";
import { container } from "tsyringe";
import { URI } from "vscode-uri";
import Parser, { Tree } from "web-tree-sitter";
import { IElmWorkspace } from "./elmWorkspace";
import { IImports } from "./imports";
import { ElmWorkspaceMatcher } from "./util/elmWorkspaceMatcher";
import { IExposing, TreeUtils } from "./util/treeUtils";

export interface ITreeContainer {
  uri: string;
  writeable: boolean;
  referenced: boolean;
  moduleName?: string;
  maintainerAndPackageName?: string;
  isExposed: boolean; // Is this file exposed by the elm.json
  parsed:
    | {
        exposing?: IExposing[]; // This file exposes
        tree: Tree;
      }
    | undefined;
}

export interface IForest {
  treeIndex: ITreeContainer[];
  existsTree(uri: string): boolean;
  getTree(uri: string): Tree | undefined;
  getExposingByModuleName(moduleName: string): IExposing[] | undefined;
  getTreeByModuleName(moduleName: string): Tree | undefined;
  getByModuleName(moduleName: string): ITreeContainer | undefined;
  getByUri(uri: string): ITreeContainer | undefined;
  setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: Tree,
    isExposed: boolean,
    packageName?: string,
  ): void;
  setEmptyTreeNode(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    isExposed: boolean,
    homeFolder: string[],
    imports: IImports,
    maintainerAndPackageName?: string,
  ): void;
  removeTree(uri: string): void;
  upsertTreeAndImports(
    elmWorkspace: IElmWorkspace,
    fileContent: string | null,
    uri: string,
  ): void;
}

export class Forest implements IForest {
  public treeIndex: ITreeContainer[] = [];
  private parser: Parser;

  constructor() {
    this.parser = container.resolve("Parser");
  }

  public existsTree(uri: string): boolean {
    return this.treeIndex.some((tree) => tree.uri === uri);
  }

  public getTree(uri: string): Tree | undefined {
    const result = this.treeIndex.find((tree) => tree.uri === uri);

    const tree = this.fillTreeIfNeeded(result, uri);

    return tree ?? result?.parsed?.tree;
  }

  private fillTreeIfNeeded(
    result?: ITreeContainer,
    uri?: string,
  ): Tree | undefined {
    if (uri && result && !result.parsed) {
      const upsertTreeAndImports = new ElmWorkspaceMatcher((uri: string) =>
        URI.parse(uri),
      ).handlerForWorkspace((uri: string, elmWorkspace: IElmWorkspace):
        | Tree
        | undefined => this.upsertTreeAndImports(elmWorkspace, null, uri));
      return upsertTreeAndImports(uri);
    }
  }

  public getExposingByModuleName(moduleName: string): IExposing[] | undefined {
    const result = this.treeIndex.find(
      (tree) => tree.moduleName === moduleName && tree.isExposed,
    );

    this.fillTreeIfNeeded(result, result?.uri);

    return result?.parsed?.exposing;
  }

  public getTreeByModuleName(moduleName: string): Tree | undefined {
    const result = this.treeIndex.find(
      (tree) => tree.moduleName === moduleName,
    );

    const tree = this.fillTreeIfNeeded(result, result?.uri);

    return tree ?? result?.parsed?.tree;
  }

  public getByModuleName(moduleName: string): ITreeContainer | undefined {
    const result = this.treeIndex.find(
      (tree) => tree.moduleName === moduleName && tree.isExposed,
    );

    this.fillTreeIfNeeded(result, result?.uri);

    return result;
  }

  public getByUri(uri: string): ITreeContainer | undefined {
    const result = this.treeIndex.find((tree) => tree.uri === uri);

    this.fillTreeIfNeeded(result, result?.uri);

    return result;
  }

  public setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: Tree,
    isExposed: boolean,
    maintainerAndPackageName?: string,
  ): void {
    const moduleResult = TreeUtils.getModuleNameAndExposing(tree);
    let moduleName: string | undefined;
    let exposing: IExposing[] | undefined;
    if (moduleResult) {
      ({ moduleName, exposing } = moduleResult);
    }

    const treeContainer = {
      maintainerAndPackageName,
      moduleName,
      uri,
      writeable,
      isExposed,
      referenced,
      parsed: {
        tree,
        exposing,
      },
    };

    const existingTree = this.treeIndex.findIndex((a) => a.uri === uri);
    if (existingTree === -1) {
      this.treeIndex.push(treeContainer);
    } else {
      this.treeIndex[existingTree] = treeContainer;
    }
  }

  public setEmptyTreeNode(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    isExposed: boolean,
    homeFolder: string[],
    imports: IImports,
    maintainerAndPackageName?: string,
  ): void {
    const moduleName: string | undefined = this.transformUriToModuleName(
      uri,
      homeFolder,
    );

    const treeContainer = {
      maintainerAndPackageName,
      moduleName,
      uri,
      writeable,
      isExposed,
      referenced,
      parsed: undefined,
    };

    const existingTree = this.treeIndex.findIndex((a) => a.uri === uri);
    if (existingTree === -1) {
      this.treeIndex.push(treeContainer);
    } else {
      this.treeIndex[existingTree] = treeContainer;
    }

    imports.addEmptyImport(uri);
  }

  private transformUriToModuleName(
    uri: string,
    homeFolder: string[],
  ): string | undefined {
    let result = uri;
    homeFolder.forEach((element) => {
      element = URI.file(element + "/").toString();
      if (result.startsWith(element)) {
        result = result
          .slice(element.length)
          .slice(0, -4)
          .replace(new RegExp("/", "g"), ".");
      }
    });

    return result;
  }

  public removeTree(uri: string): void {
    // Not sure this is the best way to do this...
    this.treeIndex = this.treeIndex.filter((tree) => tree.uri !== uri);
  }

  public upsertTreeAndImports(
    elmWorkspace: IElmWorkspace,
    fileContent: string | null,
    uri: string,
  ): Tree | undefined {
    const imports = elmWorkspace.getImports();
    let tree: Tree | undefined = undefined;
    if (fileContent != null) {
      tree = this.getTree(uri);
    }
    if (tree === undefined || fileContent == null) {
      fileContent = readFileSync(URI.parse(uri).fsPath, "utf8");
    }
    tree = this.parser.parse(fileContent);
    if (tree) {
      this.setTree(uri, true, true, tree, true);
      // Figure out if we have files importing our changed file - update them
      const urisToRefresh = [];
      for (const uri of imports.getUrisOfAllImports()) {
        const fileImports = imports.getImportListByUri(uri);
        if (fileImports?.some((a) => a.fromUri === uri)) {
          urisToRefresh.push(uri);
        }
      }
      urisToRefresh.forEach((a) => {
        imports.updateImports(a, this.getTree(a)!);
      });
      // Refresh imports of the calling file
      imports.updateImports(uri, tree);

      return tree;
    }
  }
}
