import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as grpc from '@grpc/grpc-js';

import {
  RunTaskRequest,
  RunTaskReply,
  Output,
  GetBuildRequest,
  GetBuildReply,
  CancelGetBuildsRequest,
  CancelGetBuildsReply,
  CancelRunTaskRequest,
  CancelRunTaskReply,
  CancelRunTasksReply,
  Cancelled,
  GradleBuild,
  CancelRunTasksRequest,
  Environment,
  GradleConfig,
} from './proto/gradle_tasks_pb';

import { GradleTasksClient as GrpcClient } from './proto/gradle_tasks_grpc_pb';
import { GradleTasksServer } from './server';
import { logger } from './logger';
import { removeCancellingTask, GradleTaskDefinition } from './tasks';
import { getGradleConfig } from './config';
import { LoggerStream } from './LoggerSteam';

const localize = nls.loadMessageBundle();

export class GradleTasksClient implements vscode.Disposable {
  private connectDeadline = 3; // seconds
  private grpcClient: GrpcClient | null = null;
  private _onConnect: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  private _onConnectFail: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onConnect: vscode.Event<null> = this._onConnect.event;
  public readonly onConnectFail: vscode.Event<null> = this._onConnectFail.event;
  private connectTries = 0;
  private maxConnectTries = 5;

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

  public handleServerReady = (): Thenable<void> => {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Gradle',
        cancellable: false,
      },
      (progress: vscode.Progress<{ message?: string }>) => {
        progress.report({ message: 'Connecting' });
        return new Promise((resolve) => {
          const disposableConnectHandler = this.onConnect(() => {
            disposableConnectHandler.dispose();
            resolve();
          });
          const disposableConnectFailHandler = this.onConnectFail(() => {
            disposableConnectFailHandler.dispose();
            resolve();
          });
          this.connectToServer();
        });
      }
    );
  };

  public handleClientReady = (err: Error | undefined): void => {
    if (err) {
      this.handleConnectError(err);
    } else {
      logger.info(
        localize('client.connected', 'Gradle client connected to server')
      );
      this._onConnect.fire(null);
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
      this.statusBarItem.hide();
    }
  }

  public async getBuild(
    projectFolder: string,
    gradleConfig: GradleConfig,
    showOutputColors = false
  ): Promise<GradleBuild | void> {
    this.statusBarItem.hide();
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Gradle',
        cancellable: true,
      },
      async (
        progress: vscode.Progress<{ message?: string }>,
        token: vscode.CancellationToken
      ) => {
        progress.report({ message: 'Configure project' });
        token.onCancellationRequested(() => this.cancelGetBuilds());

        const stdOutLoggerStream = new LoggerStream(logger, 'info');
        const stdErrLoggerStream = new LoggerStream(logger, 'error');

        const request = new GetBuildRequest();
        request.setProjectDir(projectFolder);
        request.setGradleConfig(gradleConfig);
        request.setShowOutputColors(showOutputColors);

        const getBuildStream = this.grpcClient!.getBuild(request);
        try {
          return await new Promise((resolve, reject) => {
            let build: GradleBuild | void = undefined;
            getBuildStream
              .on('data', (getBuildReply: GetBuildReply) => {
                switch (getBuildReply.getKindCase()) {
                  case GetBuildReply.KindCase.PROGRESS:
                    const message = getBuildReply
                      .getProgress()!
                      .getMessage()
                      .trim();
                    if (message) {
                      progress.report({ message });
                    }
                    break;
                  case GetBuildReply.KindCase.OUTPUT:
                    switch (getBuildReply.getOutput()!.getOutputType()) {
                      case Output.OutputType.STDOUT:
                        stdOutLoggerStream.write(
                          getBuildReply.getOutput()!.getOutputBytes_asU8()
                        );
                        break;
                      case Output.OutputType.STDERR:
                        stdErrLoggerStream.write(
                          getBuildReply.getOutput()!.getOutputBytes_asU8()
                        );
                        break;
                    }
                    break;
                  case GetBuildReply.KindCase.CANCELLED:
                    this.handleGetBuildCancelled(getBuildReply.getCancelled()!);
                    break;
                  case GetBuildReply.KindCase.GET_BUILD_RESULT:
                    build = getBuildReply.getGetBuildResult()!.getBuild();
                    break;
                  case GetBuildReply.KindCase.ENVIRONMENT:
                    this.handleGetBuildEnvironment(
                      getBuildReply.getEnvironment()!
                    );
                    break;
                }
              })
              .on('error', reject)
              .on('end', () => resolve(build));
          });
        } catch (err) {
          logger.error(
            localize(
              'client.errorGettingBuild',
              'Error getting build for {0}: {1}',
              projectFolder,
              err.details || err.message
            )
          );
          this.statusBarItem.command = 'gradle.showLogs';
          this.statusBarItem.text = localize(
            // TODO
            'client.buildError',
            '{0} Gradle: Build Error',
            '$(issues)'
          );
          this.statusBarItem.show();
        }
      }
    );
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  public async runTask(
    projectFolder: string,
    task: vscode.Task,
    args: ReadonlyArray<string> = [],
    input = '',
    javaDebugPort = 0,
    onOutput?: (output: Output) => void,
    showOutputColors = true
  ): Promise<void> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Gradle',
        cancellable: true,
      },
      async (
        progress: vscode.Progress<{ message?: string }>,
        token: vscode.CancellationToken
      ) => {
        token.onCancellationRequested(() =>
          vscode.commands.executeCommand('gradle.cancelTask', task)
        );

        const gradleConfig = getGradleConfig();
        const request = new RunTaskRequest();
        request.setProjectDir(projectFolder);
        request.setTask(task.definition.script);
        request.setArgsList(args as string[]);
        request.setGradleConfig(gradleConfig);
        request.setJavaDebug(task.definition.javaDebug);
        request.setShowOutputColors(showOutputColors);
        request.setJavaDebugPort(javaDebugPort);
        request.setInput(input);
        const runTaskStream = this.grpcClient!.runTask(request);
        try {
          await new Promise((resolve, reject) => {
            runTaskStream
              .on('data', (runTaskReply: RunTaskReply) => {
                switch (runTaskReply.getKindCase()) {
                  case RunTaskReply.KindCase.PROGRESS:
                    const message = runTaskReply
                      .getProgress()!
                      .getMessage()
                      .trim();
                    if (message) {
                      progress.report({ message });
                    }
                    break;
                  case RunTaskReply.KindCase.OUTPUT:
                    if (onOutput) {
                      onOutput(runTaskReply.getOutput()!);
                    }
                    break;
                  case RunTaskReply.KindCase.CANCELLED:
                    this.handleRunTaskCancelled(
                      task,
                      runTaskReply.getCancelled()!
                    );
                    break;
                }
              })
              .on('error', reject)
              .on('end', resolve);
          });
          logger.info(
            localize(
              'client.completedTask',
              'Completed task: {0}',
              task.definition.script
            )
          );
        } catch (err) {
          logger.error(
            localize(
              'client.errorRunningTask',
              'Error running task: {0}',
              err.details || err.message
            )
          );
        }
      }
    );
  }

  public async cancelRunTask(task: vscode.Task): Promise<void> {
    const definition = task.definition as GradleTaskDefinition;
    const request = new CancelRunTaskRequest();
    request.setProjectDir(definition.projectFolder);
    request.setTask(definition.script);
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
      logger.debug(cancelRunTaskReply.getMessage());
      if (!cancelRunTaskReply.getTaskRunning()) {
        removeCancellingTask(task);
      }
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
    const request = new CancelRunTasksRequest();
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
      logger.debug(cancelRunTasksReply.getMessage());
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

  public async cancelGetBuilds(): Promise<void> {
    const request = new CancelGetBuildsRequest();
    try {
      const cancelGetBuildsReply: CancelGetBuildsReply = await new Promise(
        (resolve, reject) => {
          this.grpcClient!.cancelGetBuilds(
            request,
            (
              err: grpc.ServiceError | null,
              cancelGetBuildsReply: CancelGetBuildsReply | undefined
            ) => {
              if (err) {
                reject(err);
              } else {
                resolve(cancelGetBuildsReply);
              }
            }
          );
        }
      );
      logger.debug(cancelGetBuildsReply.getMessage());
    } catch (err) {
      logger.error(
        localize(
          'client.errorCancellingGetBuilds',
          'Error cancelling get builds: {0}',
          err.details || err.message
        )
      );
    }
  }

  private handleGetBuildEnvironment(environment: Environment): void {
    const javaEnv = environment.getJavaEnvironment()!;
    const gradleEnv = environment.getGradleEnvironment()!;
    logger.info('Java Home:', javaEnv.getJavaHome());
    logger.info('JVM Args:', javaEnv.getJvmArgsList().join(','));
    logger.info('Gradle User Home:', gradleEnv.getGradleUserHome());
    logger.info('Gradle Version:', gradleEnv.getGradleVersion());
  }

  private handleRunTaskCancelled = (
    task: vscode.Task,
    cancelled: Cancelled
  ): void => {
    logger.info(
      localize(
        'client.runTaskCancelled',
        // FIXME
        'Task cancelled: {0}: {1}',
        task.definition.script,
        cancelled.getMessage()
      )
    );
    removeCancellingTask(task);
  };

  private handleGetBuildCancelled = (cancelled: Cancelled): void => {
    logger.info(
      localize(
        'client.getBuildCancelled',
        'Get build cancelled: {0}',
        cancelled.getMessage()
      )
    );
  };

  private handleConnectError = (e: Error): void => {
    // Even though the gRPC client should keep retrying to connect, in some cases
    // that doesn't work as expected (like CI tests in Windows), which is why we
    // have to manually keep retrying.
    if (this.connectTries < this.maxConnectTries) {
      this.connectTries += 1;
      this.grpcClient?.close();
      this.connectToServer();
    } else {
      logger.error(
        localize(
          'client.errorConnectingToServer',
          'Error connecting to gradle server: {0}',
          e.message
        )
      );
      this._onConnectFail.fire(null);
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
  context: vscode.ExtensionContext
): GradleTasksClient {
  const statusBarItem = vscode.window.createStatusBarItem();
  const client = new GradleTasksClient(server, statusBarItem);
  context.subscriptions.push(client, statusBarItem);
  client.onConnect(() => {
    setTimeout(() => {
      vscode.commands.executeCommand('gradle.refresh');
    }, 1); // wait for other onConnectHandler to fire first
  });
  return client;
}
