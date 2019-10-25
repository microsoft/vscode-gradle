import { Task, TaskDefinition } from 'vscode';
import GradleTaskRegistry from './GradleTaskRegistry';
import Gradle from './Gradle';

const TASK_TYPE: string = 'gradle';

function buildTask(definition: TaskDefinition): Task {
  return new Task(
    definition,
    definition.name,
    TASK_TYPE,
    Gradle.buildRunTaskExecution(definition)
  );
}

export default class TaskProvider {
  constructor(readonly taskRegistry: GradleTaskRegistry) {}
  provideTasks(): Task[] {
    return this.taskRegistry.getTasks().map(gradleTask =>
      buildTask({
        type: TASK_TYPE,
        name: gradleTask.name
      })
    );
  }
  resolveTask(_task: Task): Task | undefined {
    const task = _task.definition.task;
    if (task) {
      return buildTask(_task.definition);
    }
    return undefined;
  }
}
