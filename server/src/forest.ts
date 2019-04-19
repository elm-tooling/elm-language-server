import { elmTree } from "./elmTree";

export interface IForest {
  treeIndex: {
    uri: string;
    writeable: boolean;
    referenced: boolean;
    tree: elmTree;
  }[];
  getTree(uri: string): elmTree | undefined;
  setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: elmTree,
  ): void;
  removeTree(uri: string): void;
}

export class Forest implements IForest {
  public treeIndex: {
    uri: string;
    writeable: boolean;
    referenced: boolean;
    tree: elmTree;
  }[] = [];

  constructor() {
    this.treeIndex = new Array();
  }

  public getTree(uri: string): elmTree | undefined {
    let result = this.treeIndex.find(tree => tree.uri === uri);
    if (result) return result.tree;
    else return undefined;
  }

  public setTree(
    uri: string,
    writeable: boolean,
    referenced: boolean,
    tree: elmTree,
  ): void {
    this.treeIndex.push({ uri, writeable, referenced, tree });
  }

  public removeTree(uri: string): void {
    // Not sure this is the best way to do this...
    this.treeIndex = this.treeIndex.filter(tree => tree.uri !== uri);
  }
}
