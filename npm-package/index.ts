import * as vscode from 'vscode';
import { Output } from './lib/proto/gradle_tasks_pb';
import { RunTaskHandler, RunTaskOpts } from './lib/runTask';
import { OutputBuffer } from './lib/OutputBuffer';

interface ExtensionApi {
  runTask: RunTaskHandler;
  onTasksLoaded: vscode.Event<null>;
}

export { Output, RunTaskHandler, RunTaskOpts, OutputBuffer, ExtensionApi };
