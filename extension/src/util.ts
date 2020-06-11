import * as vscode from 'vscode';
import * as net from 'net';
import * as fg from 'fast-glob';
import { GradleProjectFolder } from './tasks/taskUtil';

export const isTest = (): boolean =>
  process.env.VSCODE_TEST?.toLowerCase() === 'true';

export const isDebuggingServer = (): boolean =>
  process.env.VSCODE_DEBUG_SERVER?.toLowerCase() === 'true';

const maximumTimeout = 120000; // 2 minutes
const tcpTimeout = 300;

function tcpExists(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const connection = net
      .connect(port, host)
      .on('error', () => {
        resolve(false);
      })
      .on('timeout', () => {
        connection.end();
        resolve(false);
      })
      .on('connect', () => {
        connection.end();
        resolve(true);
      });
    connection.setTimeout(tcpTimeout);
  });
}

async function tryConnect(
  host: string,
  port: number,
  startTime: number
): Promise<void> {
  const connected = await tcpExists(host, port);
  if (connected) {
    return;
  }
  if (Date.now() - startTime >= maximumTimeout) {
    throw new Error('Unable to wait on tcp due to maxmium timeout reached');
  }
  await tryConnect(host, port, startTime);
}

export function waitOnTcp(host: string, port: number): Promise<void> {
  return tryConnect(host, port, Date.now());
}

export function getGradleBuildFile(
  gradleProjectFolder: GradleProjectFolder
): string {
  const files = fg.sync('!(*settings){.gradle,.gradle.kts}', {
    onlyFiles: true,
    cwd: gradleProjectFolder.uri.fsPath,
    deep: 1,
    absolute: true,
  });
  return files[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isWorkspaceFolder(value: any): value is vscode.WorkspaceFolder {
  return value && typeof value !== 'number';
}
