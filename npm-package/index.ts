import {
  Output,
  RunTaskRequest,
  CancelRunTaskRequest,
} from './lib/proto/gradle_tasks_pb';
import { Api, RunTaskOpts, CancelTaskOpts } from './lib/api';

export {
  Output,
  RunTaskRequest,
  RunTaskOpts,
  CancelTaskOpts,
  CancelRunTaskRequest,
  Api as ExtensionApi,
};
