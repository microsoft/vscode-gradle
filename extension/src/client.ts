import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as grpc from '@grpc/grpc-js';

import {
  Progress,
  RunTaskRequest,
  RunTaskReply,
  Output,
  GetProjectRequest,
  GetProjectReply,
  GradleProject,
  CancelGetProjectsRequest,
  CancelGetProjectsReply,
  CancelRunTaskRequest,
  CancelRunTaskReply,
  CancelRunTasksReply,
  Cancelled,
} from './proto/gradle_tasks_pb';

import { GradleTasksClient as GrpcClient } from './proto/gradle_tasks_grpc_pb';
import { GradleTasksServer } from './server';
import { logger } from './logger';
import { handleCancelledTask } from './tasks';

const localize = nls.loadMessageBundle();

export class GradleTasksClient implements vscode.Disposable {
  private connectDeadline = 5; // seconds
  private grpcClient: GrpcClient | null = null;
  private _onConnect: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onConnect: vscode.Event<null> = this._onConnect.event;
  private connectTries = 0;
  private maxConnectTries = 3;

  public constructor(
    private readonly server: GradleTasksServer,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {
    this.server.onReady(this.handleServerReady);
    this.server.onStop(this.handleServerStop);
    this.server.start();
  }

  private handleServerStop = (): void => {
    //
  };

  public handleServerReady = (): void => {
    logger.info(
      localize('client.connecting', 'Gradle client connecting to server')
    );
    this.connectToServer();
  };

  public handleClientReady = (err: Error | undefined): void => {
    if (err) {
      this.handleConnectError(err);
    } else {
      logger.info(
        localize('client.connected', 'Gradle client connected to server')
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
      logger.error(
        localize(
          'client.grpcClientConstructionError',
          'Unable to construct the gRPC client: {0}',
          err.message
        )
      );
    }
  }

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
        let project: GradleProject | void = undefined;
        getProjectStream
          .on('data', (getProjectReply: GetProjectReply) => {
            switch (getProjectReply.getKindCase()) {
              case GetProjectReply.KindCase.PROGRESS:
                this.handleProgress(getProjectReply.getProgress()!);
                break;
              case GetProjectReply.KindCase.OUTPUT:
                this.handleOutput(getProjectReply.getOutput()!);
                break;
              case GetProjectReply.KindCase.CANCELLED:
                this.handleGetProjectCancelled(getProjectReply.getCancelled()!);
                break;
              case GetProjectReply.KindCase.GET_PROJECT_RESULT:
                project = getProjectReply.getGetProjectResult()!.getProject();
                break;
            }
          })
          .on('error', reject)
          .on('end', () => {
            resolve(project);
          });
      });
    } catch (err) {
      logger.error(
        localize(
          'client.errorGettingProject',
          'Error getting project for {0}: {1}',
          sourceDir,
          err.details || err.message
        )
      );
    } finally {
      this.statusBarItem.hide();
    }
  }

  public async runTask(
    sourceDir: string,
    task: string,
    args: string[] = [],
    onOutput: (output: Output) => void
  ): Promise<void> {
    this.statusBarItem.show();
    const request = new RunTaskRequest();
    request.setSourceDir(sourceDir);
    request.setTask(task);
    request.setArgsList(args);
    const runTaskStream = this.grpcClient!.runTask(request);
    try {
      await new Promise((resolve, reject) => {
        runTaskStream
          .on('data', (runTaskReply: RunTaskReply) => {
            switch (runTaskReply.getKindCase()) {
              case RunTaskReply.KindCase.PROGRESS:
                this.handleProgress(runTaskReply.getProgress()!);
                break;
              case RunTaskReply.KindCase.OUTPUT:
                onOutput(runTaskReply.getOutput()!);
                break;
              case RunTaskReply.KindCase.CANCELLED:
                this.handleRunTaskCancelled(runTaskReply.getCancelled()!);
                break;
            }
          })
          .on('error', reject)
          .on('end', () => {
            resolve();
          });
      });
      logger.info(localize('client.completedTask', 'Completed task {0}', task));
    } catch (err) {
      logger.error(
        localize(
          'client.errorRunningTask',
          'Error running task: {0} {1}',
          err.details || err.message,
          JSON.stringify(request.toObject(), null, 2)
        )
      );
    } finally {
      this.statusBarItem.hide();
    }
  }

  public async cancelRunTask(sourceDir: string, task: string): Promise<void> {
    const request = new CancelRunTaskRequest();
    request.setSourceDir(sourceDir);
    request.setTask(task);
    try {
      const cancelRunTaskReply: CancelRunTaskReply = await new Promise(
        (resolve, reject) => {
          this.grpcClient!.cancelRunTask(
            request,
            (
              err: grpc.ServiceError | null,
              cancelRunTaskReply: CancelRunTaskReply | undefined
            ) => {
              if (err) {
                reject(err);
              } else {
                resolve(cancelRunTaskReply);
              }
            }
          );
        }
      );
      logger.info(cancelRunTaskReply.getMessage());
    } catch (err) {
      logger.error(
        localize(
          'client.errorCancellingRunningTask',
          'Error cancelling running task: {0}',
          err.details || err.message
        )
      );
    }
  }

  public async cancelRunTasks(): Promise<void> {
    const request = new CancelRunTaskRequest();
    try {
      const cancelRunTasksReply: CancelRunTasksReply = await new Promise(
        (resolve, reject) => {
          this.grpcClient!.cancelRunTasks(
            request,
            (
              err: grpc.ServiceError | null,
              cancelRunTasksReply: CancelRunTasksReply | undefined
            ) => {
              if (err) {
                reject(err);
              } else {
                resolve(cancelRunTasksReply);
              }
            }
          );
        }
      );
      logger.info(cancelRunTasksReply.getMessage());
    } catch (err) {
      logger.error(
        localize(
          'client.errorCancellingRunningTasks',
          'Error cancelling running tasks: {0}',
          err.details || err.message
        )
      );
    }
  }

  public async cancelGetProjects(): Promise<void> {
    const request = new CancelGetProjectsRequest();
    try {
      const cancelGetProjectsReply: CancelGetProjectsReply = await new Promise(
        (resolve, reject) => {
          this.grpcClient!.cancelGetProjects(
            request,
            (
              err: grpc.ServiceError | null,
              cancelGetProjectsReply: CancelGetProjectsReply | undefined
            ) => {
              if (err) {
                reject(err);
              } else {
                resolve(cancelGetProjectsReply);
              }
            }
          );
        }
      );
      logger.info(cancelGetProjectsReply.getMessage());
    } catch (err) {
      logger.error(
        localize(
          'client.errorCancellingGetProjects',
          'Error cancelling get projects: {0}',
          err.details || err.message
        )
      );
    }
  }

  private handleRunTaskCancelled = (cancelled: Cancelled): void => {
    logger.info(
      localize(
        'client.runTaskCancelled',
        'Task cancelled: {0}',
        cancelled.getMessage()
      )
    );
    handleCancelledTask(cancelled);
  };

  private handleGetProjectCancelled = (cancelled: Cancelled): void => {
    logger.info(
      localize(
        'client.getProjectCancelled',
        'Get project cancelled: {0}',
        cancelled.getMessage()
      )
    );
  };

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
    // Even though the gRPC client should keep retrying to connect, in some cases
    // that doesn't work as expected (like CI tests for windows), which is why we
    // have to manually keep retrying.
    if (this.connectTries < this.maxConnectTries) {
      this.connectTries += 1;
      this.grpcClient?.close();
      this.connectToServer();
    } else {
      this.server.showRestartMessage();
    }
  };

  public dispose(): void {
    this.grpcClient?.close();
    this._onConnect.dispose();
  }
}

export function registerClient(
  server: GradleTasksServer,
  statusBarItem: vscode.StatusBarItem,
  context: vscode.ExtensionContext
): GradleTasksClient {
  const client = new GradleTasksClient(server, statusBarItem);
  context.subscriptions.push(client);
  client.onConnect(() => {
    vscode.commands.executeCommand('gradle.refresh', false);
  });
  return client;
}
