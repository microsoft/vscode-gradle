import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as grpc from '@grpc/grpc-js';

import {
  // GetTasksRequest,
  // GradleTask,
  // GetTasksReply,
  Progress,
  RunTaskRequest,
  RunTaskReply,
  Output,
  GetProjectRequest,
  GetProjectReply,
  GradleProject,
} from './proto/gradle_tasks_pb';

import { GradleTasksClient as GrpcClient } from './proto/gradle_tasks_grpc_pb';
import { GradleTasksServer } from './server';
import { logger } from './logger';
import { GradleTaskDefinition } from './tasks';

const localize = nls.loadMessageBundle();

export class GradleTasksClient implements vscode.Disposable {
  private connectDeadline = 10; // seconds
  private grpcClient: GrpcClient | null = null;
  private _onConnect: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onConnect: vscode.Event<null> = this._onConnect.event;

  public constructor(
    private readonly server: GradleTasksServer,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {
    this.server.onReady(this.handleServerReady);
    this.server.onStop(this.handleServerStop);
  }

  private handleServerStop = (): void => {
    //
  };

  public handleServerReady = (): void => {
    logger.info(
      localize('client.connecting', 'Gradle client connecting to server...')
    );
    this.connectToServer();
  };

  public handleClientReady = (err: Error | undefined): void => {
    if (err) {
      this.handleConnectError(err);
    } else {
      logger.info(
        localize(
          'client.connected',
          'Gradle client successfully connected to server!'
        )
      );
      this._onConnect.fire();
    }
  };

  private connectToServer(): void {
    try {
      this.grpcClient = new GrpcClient(
        `localhost:${this.server.getPort()}`,
        grpc.credentials.createInsecure()
      );
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + this.connectDeadline);
      this.grpcClient.waitForReady(deadline, this.handleClientReady);
    } catch (err) {
      logger.error(`Unable to construct the gRPC client: ${err.message}`);
    }
  }

  // public async getTasks(sourceDir: string): Promise<GradleTask[] | void> {
  //   this.statusBarItem.text = localize(
  //     'client.refreshingTasks',
  //     '{0} Gradle: Refreshing Tasks',
  //     '$(sync~spin)'
  //   );
  //   this.statusBarItem.show();
  //   const request = new GetTasksRequest();
  //   request.setSourceDir(sourceDir);
  //   const getTasksSteam = this.grpcClient!.getTasks(request);
  //   try {
  //     return await new Promise((resolve, reject) => {
  //       getTasksSteam
  //         .on('error', reject)
  //         .on('data', (getTasksReply: GetTasksReply) => {
  //           switch (getTasksReply.getKindCase()) {
  //             case GetTasksReply.KindCase.PROGRESS:
  //               this.handleProgress(getTasksReply.getProgress()!);
  //               break;
  //             case GetTasksReply.KindCase.OUTPUT:
  //               this.handleOutput(getTasksReply.getOutput()!);
  //               break;
  //             case GetTasksReply.KindCase.GET_TASKS_RESULT:
  //               resolve(getTasksReply.getGetTasksResult()!.getTasksList());
  //               break;
  //           }
  //         });
  //     });
  //   } finally {
  //     this.statusBarItem.hide();
  //   }
  // }

  public async getProject(sourceDir: string): Promise<GradleProject | void> {
    this.statusBarItem.text = localize(
      'client.refreshingTasks',
      '{0} Gradle: Refreshing Tasks',
      '$(sync~spin)'
    );
    this.statusBarItem.show();
    const request = new GetProjectRequest();
    request.setSourceDir(sourceDir);
    const getProjectStream = this.grpcClient!.getProject(request);
    try {
      return await new Promise((resolve, reject) => {
        getProjectStream
          .on('error', reject)
          .on('data', (getProjectReply: GetProjectReply) => {
            switch (getProjectReply.getKindCase()) {
              case GetProjectReply.KindCase.PROGRESS:
                this.handleProgress(getProjectReply.getProgress()!);
                break;
              case GetProjectReply.KindCase.OUTPUT:
                this.handleOutput(getProjectReply.getOutput()!);
                break;
              case GetProjectReply.KindCase.GET_PROJECT_RESULT:
                resolve(getProjectReply.getGetProjectResult()!.getProject());
                break;
            }
          });
      });
    } finally {
      this.statusBarItem.hide();
    }
  }

  public async runTask(
    sourceDir: string,
    taskDefinition: GradleTaskDefinition,
    args: string[],
    onOutput: (output: Output) => void = this.handleOutput,
    onProgress: (progress: Progress) => void = this.handleProgress
  ): Promise<void> {
    this.statusBarItem.show();
    const request = new RunTaskRequest();
    request.setSourceDir(sourceDir);
    request.setTask(taskDefinition.script);
    request.setArgsList(args);
    const runTaskStream = this.grpcClient!.runTask(request);
    try {
      await new Promise((resolve, reject) => {
        runTaskStream
          .on('error', reject)
          .on('data', (runTaskReply: RunTaskReply) => {
            switch (runTaskReply.getKindCase()) {
              case RunTaskReply.KindCase.PROGRESS:
                onProgress(runTaskReply.getProgress()!);
                break;
              case RunTaskReply.KindCase.OUTPUT:
                onOutput(runTaskReply.getOutput()!);
                break;
              case RunTaskReply.KindCase.RUN_TASK_RESULT:
                resolve();
                break;
            }
          });
      });
      logger.info(
        localize('client.completedTask', 'Completed {0}', taskDefinition.script)
      );
      vscode.commands.executeCommand(
        'gradle.updateJavaProjectConfiguration',
        vscode.Uri.file(taskDefinition.buildFile)
      );
    } catch (e) {
      logger.error(
        localize(
          'client.errorRunningTask',
          'Error running task: {0}',
          e.message
        )
      );
    } finally {
      this.statusBarItem.hide();
    }
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  public async stopTask(sourceDir: string, task: string): Promise<void> {
    if (this.grpcClient) {
      // try {
      //   const stopTask = new ClientMessage.StopTask();
      //   stopTask.setSourceDir(sourceDir);
      //   stopTask.setTask(task);
      //   const message = new ClientMessage.Message();
      //   message.setStopTask(stopTask);
      //   await this.sendMessage(message);
      // } catch (e) {
      //   logger.error(
      //     localize(
      //       'client.errorStoppingTask',
      //       'Error stopping task: {0}',
      //       e.message
      //     )
      //   );
      // } finally {
      //   this.statusBarItem.hide();
      // }
    }
  }

  public async stopGetTasks(sourceDir = ''): Promise<void> {
    // if (this.grpcClient) {
    //   try {
    //     const stopGetTasks = new ClientMessage.StopGetTasks();
    //     stopGetTasks.setSourceDir(sourceDir);
    //     const message = new ClientMessage.Message();
    //     message.setStopGetTasks(stopGetTasks);
    //     await this.sendMessage(message);
    //   } finally {
    //     this.statusBarItem.hide();
    //   }
    // }
  }

  private handleProgress = (progress: Progress): void => {
    const messageStr = progress.getMessage().trim();
    if (messageStr) {
      this.statusBarItem.text = `$(sync~spin) Gradle: ${messageStr}`;
    }
  };

  private handleOutput = (output: Output): void => {
    const logMessage = output.getMessage().trim();
    if (logMessage) {
      switch (output.getOutputType()) {
        case Output.OutputType.STDERR:
          logger.error(logMessage);
          break;
        case Output.OutputType.STDOUT:
          logger.info(logMessage);
          break;
      }
    }
  };

  private handleConnectError = (e: Error): void => {
    logger.error(
      localize(
        'client.errorConnectingToServer',
        'Error connecting to gradle server: {0}',
        e.message
      )
    );
    this.server.showRestartMessage();
  };

  public dispose(): void {
    this.grpcClient?.close();
    this._onConnect.dispose();
  }
}

export function registerClient(
  context: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem,
  server: GradleTasksServer
): GradleTasksClient {
  const client = new GradleTasksClient(server, statusBarItem);
  context.subscriptions.push(client);
  client.onConnect(() => {
    vscode.commands.executeCommand('gradle.refresh', false);
  });
  return client;
}
