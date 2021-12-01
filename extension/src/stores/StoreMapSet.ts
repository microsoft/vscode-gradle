import { StoreMap } from "./StoreMap";

export class StoreMapSet<K, V> extends StoreMap<K, Set<V>> {
    public addEntry(key: K, value: V, fireOnDidChange = true): void {
        let set = this.getItem(key);
        if (!set) {
            set = new Set<V>();
            this.setItem(key, set, false);
        }
        if (!set.has(value)) {
            set.add(value);
            if (fireOnDidChange) {
                this.fireOnDidChange(set);
            }
        }
    }

    public removeEntry(key: K, value: V, fireOnDidChange = true): void {
        const set = this.getItem(key);
        if (set && set.has(value)) {
            set.delete(value);
            if (set.size === 0) {
                this.removeItem(key, false);
            }
            if (fireOnDidChange) {
                this.fireOnDidChange(set);
            }
        }
    }
}
