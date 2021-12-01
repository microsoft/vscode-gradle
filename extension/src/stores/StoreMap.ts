import { EventedStore } from ".";

export abstract class StoreMap<K, V> extends EventedStore<V> {
    private readonly data = new Map<K, V>();

    public getItem(key: K): V | void {
        return this.data.get(key);
    }

    public getData(): Map<K, V> {
        return this.data;
    }

    public get(key: K): V | undefined {
        return this.getData().get(key);
    }

    public clear(fireOnDidChange = true): void {
        this.data.clear();
        if (fireOnDidChange) {
            this.fireOnDidChange(null);
        }
    }

    public setItem(key: K, value: V, fireOnDidChange = true): void {
        this.data.set(key, value);
        if (fireOnDidChange) {
            this.fireOnDidChange(value);
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
