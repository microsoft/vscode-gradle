import {
  Output,
  RunTaskRequest,
  CancelRunTaskRequest,
} from './lib/proto/gradle_pb';
import type { Api, RunTaskOpts, CancelTaskOpts } from './lib/api/Api';

export {
  Output,
  RunTaskRequest,
  RunTaskOpts,
  CancelTaskOpts,
  CancelRunTaskRequest,
  Api as ExtensionApi,
};
