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
  private connectDeadline = 30; // seconds
  private grpcClient: GrpcClient | null = null;
  private _onConnect: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onConnect: vscode.Event<null> = this._onConnect.event;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly server: GradleTasksServer,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {
    this.server.onReady(this.handleServerReady);
    this.server.onStop(this.handleServerStop);

    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(
        (event: vscode.ConfigurationChangeEvent) => {
          if (event.affectsConfiguration('java.home')) {
            this.server.restart();
          }
        }
      )
    );

    this.server.start();
  }

  private handleServerStop = (): void => {
    //
  };

  public handleServerReady = (): void => {
    logger.debug(
      // TODO
      localize('client.connecting', 'Gradle client connecting to server')
    );
    this.connectToServer();
  };

  public handleClientReady = (err: Error | undefined): void => {
    if (err) {
      this.handleConnectError(err);
    } else {
      logger.info(
        localize(
          // TODO
          'client.connected',
          'Gradle client connected to server'
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
      // TODO
      logger.error(`Unable to construct the gRPC client: ${err.message}`);
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
          .on('error', reject)
          .on('end', () => resolve(project))
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
          });
      });
    } catch (err) {
      logger.error(
        // TODO
        localize(
          'client.errorGettingProjectData',
          'Error getting project data for {0}: {1}',
          sourceDir,
          err.message
        )
      );
    } finally {
      this.statusBarItem.hide();
    }
  }

  public async runTask(
    sourceDir: string,
    task: string,
    args: string[],
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
          .on('error', reject)
          .on('end', resolve)
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
          });
      });
      logger.info(localize('client.completedTask', 'Completed task {0}', task));
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

  public async cancelRunTask(sourceDir: string, task: string): Promise<void> {
    const request = new CancelRunTaskRequest();
    request.setSourceDir(sourceDir);
    request.setTask(task);
    const cancelRunTaskStream = this.grpcClient!.cancelRunTask(request);
    try {
      const message: string = await new Promise((resolve, reject) => {
        cancelRunTaskStream
          .on('error', reject)
          .on('data', (cancelRunTaskReply: CancelRunTaskReply) => {
            resolve(cancelRunTaskReply.getMessage());
          });
      });
      logger.info(message);
    } catch (e) {
      logger.error(
        // TODO
        localize(
          'client.errorCancellingRunningTask',
          'Error cancelling running task: {0}',
          e.message
        )
      );
    }
  }

  public async cancelRunTasks(): Promise<void> {
    const request = new CancelRunTaskRequest();
    const cancelRunTasksStream = this.grpcClient!.cancelRunTasks(request);
    try {
      const message: string = await new Promise((resolve, reject) => {
        cancelRunTasksStream
          .on('error', reject)
          .on('data', (cancelRunTasksReply: CancelRunTasksReply) => {
            resolve(cancelRunTasksReply.getMessage());
          });
      });
      logger.info(message);
    } catch (e) {
      logger.error(
        // TODO
        localize(
          'client.errorCancellingRunningTasks',
          'Error cancelling running tasks: {0}',
          e.message
        )
      );
    }
  }

  public async cancelGetProjects(): Promise<void> {
    const request = new CancelGetProjectsRequest();
    const cancelGetProjectsStream = this.grpcClient!.cancelGetProjects(request);
    try {
      const message: string = await new Promise((resolve, reject) => {
        cancelGetProjectsStream
          .on('error', reject)
          .on('data', (cancelGetProjectsReply: CancelGetProjectsReply) => {
            resolve(cancelGetProjectsReply.getMessage());
          });
      });
      logger.info(message);
    } catch (e) {
      logger.error(
        // TODO
        localize(
          'client.errorCancellingGetProjects',
          'Error cancelling get projects data process: {0}',
          e.message
        )
      );
    }
  }

  private handleRunTaskCancelled = (cancelled: Cancelled): void => {
    logger.info(
      localize(
        'tasks.taskCancelled',
        'Task cancelled: {0}',
        cancelled.getMessage()
      )
    );
    handleCancelledTask(cancelled);
  };

  private handleGetProjectCancelled = (cancelled: Cancelled): void => {
    // TODO
    logger.info(
      localize(
        'tasks.getProjectCancelled',
        'Task cancelled: {0}',
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
    this.server.showRestartMessage();
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
  const client = new GradleTasksClient(context, server, statusBarItem);
  context.subscriptions.push(client);
  client.onConnect(() => {
    vscode.commands.executeCommand('gradle.refresh', false);
  });
  return client;
}
