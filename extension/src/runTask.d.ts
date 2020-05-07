import { Output } from './proto/gradle_tasks_pb';

export type RunTaskHandler = (
  projectFolder: string,
  taskName: string,
  args?: ReadonlyArray<string>,
  showProgress?: boolean,
  onOutput?: (output: Output) => void
) => Promise<void>;
