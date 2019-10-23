import GradleTask from './GradleTask';

const TASK_REGEX: RegExp = /$\s*([a-z0-9]+)\s-\s(.*)$/gim;

export default class GradleOutputParser {
  private constructor() {}

  static parseTasks(stdout: string) {
    const tasks: GradleTask[] = [];
    let match: RegExpExecArray | null = null;
    while ((match = TASK_REGEX.exec(stdout)) !== null) {
      tasks.push(new GradleTask(match[1], match[2]));
    }
    return tasks;
  }
}
