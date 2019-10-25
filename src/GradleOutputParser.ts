import GradleTask from './GradleTask';

const TASK_REGEX: RegExp = /$\s*([a-z0-9]+)\s-\s(.*)$/gim;

function parseTasks(stdout: string): GradleTask[] {
  const tasks: GradleTask[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = TASK_REGEX.exec(stdout)) !== null) {
    const [, name, description] = match;
    tasks.push(new GradleTask(name, description));
  }
  return tasks;
}

export default { parseTasks };
