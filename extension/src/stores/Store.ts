import { EventedStore } from './EventedStore';

export abstract class Store<K, V> extends EventedStore {
  private readonly data = new Map<K, V>();

  public getItem(key: K): V | void {
    return this.data.get(key);
  }

  public getData(): Map<K, V> {
    return this.data;
  }

  public setItem(key: K, value: V, fireOnDidChange = true): void {
    this.data.set(key, value);
    if (fireOnDidChange) {
      this.fireOnDidChange();
    }
  }

  public removeItem(key: K, fireOnDidChange = true): void {
    this.data.delete(key);
    if (fireOnDidChange) {
      this.fireOnDidChange();
    }
  }
}
