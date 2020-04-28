import * as net from 'net';

export const isTest = (): boolean =>
  process.env.VSCODE_TEST?.toLowerCase() === 'true';

export const isDebuggingServer = (): boolean =>
  process.env.VSCODE_DEBUG_SERVER?.toLowerCase() === 'true';

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

async function tryConnect(host: string, port: number): Promise<void> {
  const connected = await tcpExists(host, port);
  if (connected) {
    return;
  }
  await tryConnect(host, port);
}

export function waitOnTcp(host: string, port: number): Promise<void> {
  return tryConnect(host, port);
}
