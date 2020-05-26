import * as vscode from 'vscode';
import * as grpc from '@grpc/grpc-js';
import { connectivityState as ConnectivityState } from '@grpc/grpc-js';

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
  GetDaemonsStatusReply,
  GetDaemonsStatusRequest,
  StopDaemonsReply,
  StopDaemonsRequest,
  StopDaemonRequest,
  StopDaemonReply,
} from '../proto/gradle_pb';

function logBuildEnvironment(environment: Environment): void {
  const javaEnv = environment.getJavaEnvironment()!;
  const gradleEnv = environment.getGradleEnvironment()!;
  logger.info('Java Home:', javaEnv.getJavaHome());
  logger.info('JVM Args:', javaEnv.getJvmArgsList().join(','));
  logger.info('Gradle User Home:', gradleEnv.getGradleUserHome());
  logger.info('Gradle Version:', gradleEnv.getGradleVersion());
}

import { GradleClient as GrpcClient } from '../proto/gradle_grpc_pb';
import { EventWaiter } from '../events/EventWaiter';
import { GradleServer } from '../server/GradleServer';
import { logger } from '../logger';
import { LoggerStream } from '../logger/LoggerSteam';
import {
  COMMAND_CANCEL_TASK,
  COMMAND_REFRESH_DAEMON_STATUS,
} from '../commands';
import { getGradleConfig } from '../config';
import { GradleTaskDefinition } from '../tasks/GradleTaskDefinition';
import { removeCancellingTask } from '../tasks/taskUtil';
import { ProgressHandler } from '../progress/ProgressHandler';

export class GradleClient implements vscode.Disposable {
  private connectDeadline = 20; // seconds
  private grpcClient: GrpcClient | null = null;
  private _onConnect: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  private _onConnectFail: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onConnect: vscode.Event<null> = this._onConnect.event;
  public readonly onConnectFail: vscode.Event<null> = this._onConnectFail.event;

  private readonly waitForConnect = new EventWaiter(this.onConnect).wait;

  public constructor(
    private readonly server: GradleServer,
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
      logger.info('Gradle client connected to server');
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
      logger.error('Unable to construct the gRPC client:', err.message);
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
        const progressHandler = new ProgressHandler(
          progress,
          'Configure project'
        );
        progressHandler.onProgressStart(() => {
          vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
        });

        await this.waitForConnect();
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
                    progressHandler.report(
                      getBuildReply.getProgress()!.getMessage().trim()
                    );
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
                    logBuildEnvironment(getBuildReply.getEnvironment()!);
                    break;
                }
              })
              .on('error', reject)
              .on('end', () => resolve(build));
          });
        } catch (err) {
          logger.error(
            `Error getting build for ${projectFolder}: ${
              err.details || err.message
            }`
          );
          this.statusBarItem.command = 'gradle.showLogs';
          this.statusBarItem.text = '$(warning) Gradle: Build Error';
          this.statusBarItem.show();
        } finally {
          vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
        }
      }
    );
  }

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
        await this.waitForConnect();
        token.onCancellationRequested(() =>
          vscode.commands.executeCommand(COMMAND_CANCEL_TASK, task)
        );

        const progressHandler = new ProgressHandler(progress);
        progressHandler.onProgressStart(() => {
          vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
        });

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
                    progressHandler.report(
                      runTaskReply.getProgress()!.getMessage().trim()
                    );
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
          logger.info('Completed task:', task.definition.script);
        } catch (err) {
          logger.error('Error running task:', err.details || err.message);
        } finally {
          vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
        }
      }
    );
  }

  public async cancelRunTask(task: vscode.Task): Promise<void> {
    await this.waitForConnect();
    const definition = task.definition as GradleTaskDefinition;
    const request = new CancelRunTaskRequest();
    request.setProjectDir(definition.projectFolder);
    request.setTask(definition.script);
    try {
      const reply: CancelRunTaskReply = await new Promise((resolve, reject) => {
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
      });
      logger.debug(reply.getMessage());
      if (!reply.getTaskRunning()) {
        removeCancellingTask(task);
      }
    } catch (err) {
      logger.error(
        'Error cancelling running task:',
        err.details || err.message
      );
    } finally {
      vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
    }
  }

  public async cancelRunTasks(): Promise<void> {
    await this.waitForConnect();
    const request = new CancelRunTasksRequest();
    try {
      const reply: CancelRunTasksReply = await new Promise(
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
      logger.debug(reply.getMessage());
    } catch (err) {
      logger.error(
        'Error cancelling running tasks:',
        err.details || err.message
      );
    }
  }

  public async cancelGetBuilds(): Promise<void> {
    await this.waitForConnect();
    const request = new CancelGetBuildsRequest();
    try {
      const reply: CancelGetBuildsReply = await new Promise(
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
      logger.debug(reply.getMessage());
    } catch (err) {
      logger.error('Error cancelling get builds:', err.details || err.message);
    }
  }

  public async getDaemonsStatus(
    projectFolder: string
  ): Promise<GetDaemonsStatusReply | void> {
    await this.waitForConnect();
    const request = new GetDaemonsStatusRequest();
    request.setProjectDir(projectFolder);
    try {
      return await new Promise((resolve, reject) => {
        this.grpcClient!.getDaemonsStatus(
          request,
          (
            err: grpc.ServiceError | null,
            getDaemonsStatusReply: GetDaemonsStatusReply | undefined
          ) => {
            if (err) {
              reject(err);
            } else {
              resolve(getDaemonsStatusReply);
            }
          }
        );
      });
    } catch (err) {
      logger.error('Error getting status:', err.details || err.message);
    }
  }

  public async stopDaemons(
    projectFolder: string
  ): Promise<StopDaemonsReply | void> {
    await this.waitForConnect();
    const request = new StopDaemonsRequest();
    request.setProjectDir(projectFolder);
    try {
      return await new Promise((resolve, reject) => {
        this.grpcClient!.stopDaemons(
          request,
          (
            err: grpc.ServiceError | null,
            stopDaemonsReply: StopDaemonsReply | undefined
          ) => {
            if (err) {
              reject(err);
            } else {
              resolve(stopDaemonsReply);
            }
          }
        );
      });
    } catch (err) {
      logger.error('Error stopping daemons:', err.details || err.message);
    }
  }

  public async stopDaemon(pid: string): Promise<StopDaemonsReply | void> {
    await this.waitForConnect();
    const request = new StopDaemonRequest();
    request.setPid(pid);
    try {
      return await new Promise((resolve, reject) => {
        this.grpcClient!.stopDaemon(
          request,
          (
            err: grpc.ServiceError | null,
            stopDaemonReply: StopDaemonReply | undefined
          ) => {
            if (err) {
              reject(err);
            } else {
              resolve(stopDaemonReply);
            }
          }
        );
      });
    } catch (err) {
      logger.error('Error stopping daemon:', err.details || err.message);
    }
  }

  private handleRunTaskCancelled = (
    task: vscode.Task,
    cancelled: Cancelled
  ): void => {
    logger.info(
      `Task cancelled: ${task.definition.script}: ${cancelled.getMessage()}`
    );
    removeCancellingTask(task);
  };

  private handleGetBuildCancelled = (cancelled: Cancelled): void => {
    logger.info('Get build cancelled:', cancelled.getMessage());
  };

  private handleConnectError = (e: Error): void => {
    logger.error('Error connecting to gradle server:', e.message);
    this.grpcClient!.close();
    this._onConnectFail.fire(null);
    if (this.server.isReady()) {
      const connectivityState = this.grpcClient!.getChannel().getConnectivityState(
        true
      );
      const enumKey = ConnectivityState[connectivityState];
      logger.error('The client has state:', enumKey);
      this.showRestartMessage();
    } else {
      this.server.showRestartMessage();
    }
  };

  public async showRestartMessage(): Promise<void> {
    const OPT_RESTART = 'Re-connect Client';
    const input = await vscode.window.showErrorMessage(
      'The Gradle client was unable to connect. Try re-connecting.',
      OPT_RESTART
    );
    if (input === OPT_RESTART) {
      this.handleServerReady();
    }
  }

  public dispose(): void {
    this.grpcClient?.close();
    this._onConnect.dispose();
  }
}
