import { Output, RunTaskRequest } from './proto/gradle_tasks_pb';

export interface RunTaskOpts {
  projectFolder: string;
  taskName: string;
  args?: ReadonlyArray<string>;
  showProgress?: boolean;
  input?: string;
  onOutput?: (output: Output) => void;
  showOutputColors: boolean;
  outputStream:
    | typeof RunTaskRequest.OutputStream.BYTES
    | typeof RunTaskRequest.OutputStream.STRING;
}

export type RunTaskHandler = (runTaskOpts: RunTaskOpts) => Promise<void>;
