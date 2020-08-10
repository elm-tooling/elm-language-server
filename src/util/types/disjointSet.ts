import { Type, TVar } from "./typeInference";

export class DisjointSet {
  private map: Map<TVar, Type> = new Map<TVar, Type>();

  public set(tvar: TVar, type: Type): void {
    this.map.set(tvar, type);
  }

  public get(type: Type): Type | undefined {
    if (type.nodeType !== "Var") {
      return type;
    }

    let node = type;
    let parent = this.map.get(node);

    while (parent?.nodeType === "Var") {
      const grandparent = this.map.get(parent);

      if (!grandparent) {
        return parent;
      }

      this.map.set(node, grandparent);
      node = parent;
      parent = grandparent;
    }

    return parent ?? node;
  }

  public contains(tvar: TVar): boolean {
    return this.map.has(tvar);
  }

  public toMap(): Map<TVar, Type> {
    return this.map;
  }
}
