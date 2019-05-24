import { Tree } from "tree-sitter";
import { Exposing, TreeUtils } from "./util/treeUtils";

export interface ITreeContainer {
  uri: string;
  writeable: boolean;
  referenced: boolean;
  moduleName: string;
  exposing: Exposing;
  tree: Tree;
}

export interface IForest {
  treeIndex: ITreeContainer[];
  getTree(uri: string): Tree | undefined;
  getExposingByModuleName(moduleName: string): Exposing | undefined;
  getTreeByModuleName(moduleName: string): Tree | undefined;
  getByModuleName(moduleName: string): ITreeContainer | undefined;
  getByUri(uri: string): ITreeContainer | undefined;
  setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: Tree,
  ): void;
  removeTree(uri: string): void;
}

export class Forest implements IForest {
  public treeIndex: ITreeContainer[] = [];

  constructor() {
    this.treeIndex = new Array();
  }

  public getTree(uri: string): Tree | undefined {
    const result = this.treeIndex.find(tree => tree.uri === uri);
    if (result) {
      return result.tree;
    } else {
      return undefined;
    }
  }

  public getExposingByModuleName(moduleName: string): Exposing | undefined {
    const result = this.treeIndex.find(tree => tree.moduleName === moduleName);
    if (result) {
      return result.exposing;
    } else {
      return undefined;
    }
  }

  public getTreeByModuleName(moduleName: string): Tree | undefined {
    const result = this.treeIndex.find(tree => tree.moduleName === moduleName);
    if (result) {
      return result.tree;
    } else {
      return undefined;
    }
  }

  public getByModuleName(moduleName: string): ITreeContainer | undefined {
    const result = this.treeIndex.find(tree => tree.moduleName === moduleName);
    if (result) {
      return result;
    } else {
      return undefined;
    }
  }

  public getByUri(uri: string): ITreeContainer | undefined {
    const result = this.treeIndex.find(tree => tree.uri === uri);
    if (result) {
      return result;
    } else {
      return undefined;
    }
  }

  public setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: Tree,
  ): void {
    const moduleResult = TreeUtils.getModuleNameAndExposing(tree);
    if (moduleResult) {
      const { moduleName, exposing } = moduleResult;

      const existingTree = this.treeIndex.findIndex(a => a.uri === uri);

      if (existingTree === -1) {
        this.treeIndex.push({
          exposing,
          moduleName,
          referenced,
          tree,
          uri,
          writeable,
        });
      } else {
        this.treeIndex[existingTree] = {
          exposing,
          moduleName,
          referenced,
          tree,
          uri,
          writeable,
        };
      }
    }
  }

  public removeTree(uri: string): void {
    // Not sure this is the best way to do this...
    this.treeIndex = this.treeIndex.filter(tree => tree.uri !== uri);
  }
}
