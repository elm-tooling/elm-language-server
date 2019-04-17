import { Tree } from "tree-sitter";

export interface IForest {
  trees: Map<string, Tree | undefined>;
  getTree(uri: string): Tree | undefined;
  setTree(uri: string, tree: Tree | undefined): void;
  removeTree(uri: string): boolean;
}

export class Forest implements IForest {
  public trees: Map<string, Tree | undefined>;

  constructor() {
    this.trees = new Map();
  }

  public getTree(uri: string): Tree | undefined {
    return this.trees.get(uri);
  }

  public setTree(uri: string, tree: Tree | undefined): void {
    this.trees.set(uri, tree);
  }

  public removeTree(uri: string): boolean {
    return this.trees.delete(uri);
  }
}
