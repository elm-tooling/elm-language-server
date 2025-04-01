import { Node } from "web-tree-sitter";

export class SyntaxNodeSet<K extends Node = Node> {
  private map = new Map<number, K>();

  constructor(...items: K[]) {
    items.forEach((value) => {
      this.add(value);
    });
  }
  public get size(): number {
    return this.map.size;
  }

  public add(value: K): this {
    this.map.set(value.id, value);
    return this;
  }

  public clear(): void {
    this.map.clear();
  }

  public delete(value: K): boolean {
    return this.map.delete(value.id);
  }

  public forEach(callbackfn: (value: K) => void): void {
    this.map.forEach((value) => {
      callbackfn(value);
    });
  }

  public has(value: K): boolean {
    return this.map.has(value.id);
  }

  public values(): IterableIterator<K> {
    return this.map.values();
  }

  public toArray(): K[] {
    return Array.from(this.values());
  }

  public addAll(other: SyntaxNodeSet<K>): this {
    other.forEach((value) => this.add(value));
    return this;
  }
}
