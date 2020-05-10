import * as vscode from 'vscode';
import { Output, RunTaskRequest } from './lib/proto/gradle_tasks_pb';
import { RunTaskHandler, RunTaskOpts } from './lib/runTask.d';
import { OutputBuffer } from './lib/OutputBuffer';

interface ExtensionApi {
  runTask: RunTaskHandler;
  onTasksLoaded: vscode.Event<null>;
}

export {
  Output,
  RunTaskRequest,
  RunTaskHandler,
  RunTaskOpts,
  OutputBuffer,
  ExtensionApi,
};
