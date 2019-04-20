import { Tree } from "tree-sitter";

export interface IForest {
  treeIndex: {
    uri: string;
    writeable: boolean;
    referenced: boolean;
    tree: Tree;
  }[];
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
  public treeIndex: {
    uri: string;
    writeable: boolean;
    referenced: boolean;
    tree: Tree;
  }[] = [];

  constructor() {
    this.treeIndex = new Array();
  }

  public getTree(uri: string): Tree | undefined {
    let result = this.treeIndex.find(tree => tree.uri === uri);
    if (result) return result.tree;
    else return undefined;
  }

  public setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: Tree,
  ): void {
    this.treeIndex.push({ uri, writeable, referenced, tree });
  }

  public removeTree(uri: string): void {
    // Not sure this is the best way to do this...
    this.treeIndex = this.treeIndex.filter(tree => tree.uri !== uri);
  }
}
