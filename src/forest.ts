import { SyntaxNode, Tree } from "web-tree-sitter";
import { IExposing, TreeUtils } from "./util/treeUtils";

export interface ITreeContainer {
  uri: string;
  writeable: boolean;
  referenced: boolean;
  moduleName?: string;
  maintainerAndPackageName?: string;
  exposing?: IExposing[]; // This file exposes
  tree: Tree;
  isExposed: boolean; // Is this file exposed by the elm.json
}

export interface IForest {
  treeIndex: ITreeContainer[];
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
  removeTree(uri: string): void;
  getUriOfNode(node: SyntaxNode): string | undefined;
}

export class Forest implements IForest {
  public treeIndex: ITreeContainer[] = [];

  public getTree(uri: string): Tree | undefined {
    const result = this.treeIndex.find((tree) => tree.uri === uri);

    return result && result.tree;
  }

  public getExposingByModuleName(moduleName: string): IExposing[] | undefined {
    const result = this.treeIndex
      .filter((tree) => tree.moduleName === moduleName)
      .sort((x, y) => {
        return x.isExposed === y.isExposed ? 0 : x.isExposed ? -1 : 1;
      })[0];
    return result && result.exposing;
  }

  public getTreeByModuleName(moduleName: string): Tree | undefined {
    const result = this.treeIndex.find(
      (tree) => tree.moduleName === moduleName,
    );

    return result && result.tree;
  }

  public getByModuleName(moduleName: string): ITreeContainer | undefined {
    return this.treeIndex
      .filter((tree) => tree.moduleName === moduleName)
      .sort((x, y) => {
        return x.isExposed === y.isExposed ? 0 : x.isExposed ? -1 : 1;
      })[0];
  }

  public getByUri(uri: string): ITreeContainer | undefined {
    return this.treeIndex.find((tree) => tree.uri === uri);
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

    const existingTree = this.treeIndex.findIndex((a) => a.uri === uri);

    const treeContainer = {
      exposing,
      maintainerAndPackageName,
      moduleName,
      referenced,
      tree,
      uri,
      writeable,
      isExposed,
    };

    if (existingTree === -1) {
      this.treeIndex.push(treeContainer);
    } else {
      this.treeIndex[existingTree] = treeContainer;
    }
  }

  public removeTree(uri: string): void {
    // Not sure this is the best way to do this...
    this.treeIndex = this.treeIndex.filter((tree) => tree.uri !== uri);
  }

  getUriOfNode(node: SyntaxNode): string | undefined {
    return this.treeIndex.find(
      (treeContainer) =>
        treeContainer.tree.rootNode.id === node.tree.rootNode.id,
    )?.uri;
  }
}
