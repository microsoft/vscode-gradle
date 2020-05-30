import { Store } from './Store';

export class StoreSet<K, V> extends Store<K, Set<V>> {
  public addEntry(key: K, value: V, fireOnDidChange = true): void {
    let set = this.getItem(key);
    if (!set) {
      set = new Set<V>();
      this.setItem(key, set);
    }
    set.add(value);
    if (fireOnDidChange) {
      this.fireOnDidChange();
    }
  }

  public removeEntry(key: K, value: V, fireOnDidChange = true): void {
    const set = this.getItem(key);
    if (set) {
      set.delete(value);
      if (set.size === 0) {
        this.removeItem(key);
      }
    }
    if (fireOnDidChange) {
      this.fireOnDidChange();
    }
  }
}
