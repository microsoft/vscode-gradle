import { Output } from './lib/proto/gradle_tasks_pb';
import { RunTaskHandler } from './lib/runTask.d';

export { Output, RunTaskHandler };

export interface ExtensionApi {
  runTask: RunTaskHandler;
}
