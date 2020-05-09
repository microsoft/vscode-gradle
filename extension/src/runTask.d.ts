import { Output } from './proto/gradle_tasks_pb';

export interface RunTaskOpts {
  projectFolder: string;
  taskName: string;
  args?: ReadonlyArray<string>;
  showProgress?: boolean;
  input?: string;
  onOutput?: (output: Output) => void;
  showOutputColors: boolean;
}

export type RunTaskHandler = (runTaskOpts: RunTaskOpts) => Promise<void>;
