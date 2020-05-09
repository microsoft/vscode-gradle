import * as vscode from 'vscode';
import { Output, RunTaskRequest } from './lib/proto/gradle_tasks_pb';
import { RunTaskHandler, RunTaskOpts } from './lib/runTask';

export { Output, RunTaskRequest, RunTaskHandler, RunTaskOpts };

export interface ExtensionApi {
  runTask: RunTaskHandler;
  onTasksLoaded: vscode.Event<null>;
}
