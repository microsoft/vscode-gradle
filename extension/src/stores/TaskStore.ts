import { TaskId, TaskArgs } from './types';
import { StoreMap } from './StoreMap';

export class TaskStore extends StoreMap<TaskId, Set<TaskArgs>> {
  public addEntry(key: TaskId, value: TaskArgs, fireOnDidChange = true): void {
    let set = this.getItem(key);
    if (!set) {
      set = new Set<TaskArgs>();
      this.setItem(key, set);
    }
    set.add(value);
    if (fireOnDidChange) {
      this.fireOnDidChange();
    }
  }

  public removeEntry(
    key: TaskId,
    value: TaskArgs,
    fireOnDidChange = true
  ): void {
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
