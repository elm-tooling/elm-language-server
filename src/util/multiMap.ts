/**
 * A map that abtracts storing items with the same key
 */
export class MultiMap<K, V> extends Map<K, V | V[]> {
  public get(
    key: K,
    filter?: (val: V) => boolean,
    sort?: (a: V, b: V) => number,
  ): V | undefined {
    let found = super.get(key);

    if (!found) {
      return;
    }

    if (Array.isArray(found)) {
      found = (filter ? found.filter(filter) : found).sort(sort)[0];
    }

    if (found && (!filter || filter(found))) {
      return found;
    }
  }

  public set(key: K, val: V): this {
    if (super.has(key)) {
      const existing = super.get(key);

      if (Array.isArray(existing)) {
        existing.push(val);
      } else if (existing) {
        super.set(key, [existing, val]);
      }
    } else {
      super.set(key, val);
    }
    return this;
  }

  public forEach(
    callbackfn: (value: V, key: K, map: Map<K, V | V[]>) => void,
  ): void {
    super.forEach((val, key, map) => {
      if (Array.isArray(val)) {
        val.forEach((v) => callbackfn(v, key, map));
      } else {
        callbackfn(val, key, map);
      }
    });
  }
}
