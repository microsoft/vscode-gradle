import { TaskId, TaskArgs } from "./types";
import { StoreMapSet } from ".";

export class TaskStore extends StoreMapSet<TaskId, TaskArgs> {}
