import { EventedStore } from '.';

export abstract class Store<K, V> extends EventedStore<V> {
  private readonly data = new Map<K, V>();

  public getItem(key: K): V | void {
    return this.data.get(key);
  }

  public getData(): Map<K, V> {
    return this.data;
  }

  public setItem(key: K, value: V, fireOnDidChange = true): void {
    if (!this.data.has(key)) {
      this.data.set(key, value);
      if (fireOnDidChange) {
        this.fireOnDidChange(value);
      }
    }
  }

  public removeItem(key: K, fireOnDidChange = true): void {
    const item = this.data.get(key);
    if (item) {
      this.data.delete(key);
      if (fireOnDidChange) {
        this.fireOnDidChange(item);
      }
    }
  }
}
