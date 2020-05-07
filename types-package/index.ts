import { Output } from './lib/proto/gradle_tasks_pb';
import { RunTaskHandler } from './lib/runTask';

export { Output, RunTaskHandler };

export interface ExtensionApi {
  runTask: RunTaskHandler;
}
