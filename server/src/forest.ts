import { Tree } from "tree-sitter";
import { Exposing, TreeUtils } from "./util/treeUtils";

export interface IForest {
  treeIndex: Array<{
    uri: string;
    writeable: boolean;
    referenced: boolean;
    moduleName: string;
    exposing: Exposing;
    tree: Tree;
  }>;
  getTree(uri: string): Tree | undefined;
  setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: Tree,
  ): void;
  removeTree(uri: string): void;
}

export class Forest implements IForest {
  public treeIndex: Array<{
    uri: string;
    writeable: boolean;
    referenced: boolean;
    moduleName: string;
    exposing: Exposing;
    tree: Tree;
  }> = [];

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

  public getTreeByModuleName(moduleName: string): Tree | undefined {
    const result = this.treeIndex.find(tree => tree.moduleName === moduleName);
    if (result) {
      return result.tree;
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
    const moduleResult = TreeUtils.getModuleName(tree);
    if (moduleResult) {
      const { moduleName, exposing } = moduleResult;

      const existingTree = this.treeIndex.findIndex(a => a.uri === uri);

      if (existingTree !== -1) {
        this.treeIndex[existingTree] = {
          exposing,
          moduleName,
          referenced,
          tree,
          uri,
          writeable,
        };
      } else {
        this.treeIndex.push({
          exposing,
          moduleName,
          referenced,
          tree,
          uri,
          writeable,
        });
      }
    }
  }

  public removeTree(uri: string): void {
    // Not sure this is the best way to do this...
    this.treeIndex = this.treeIndex.filter(tree => tree.uri !== uri);
  }
}
