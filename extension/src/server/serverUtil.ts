import { getConfigGradleJavaHome } from '../util/config';

export function getGradleServerCommand(): string {
  const platform = process.platform;
  if (platform === 'win32') {
    return 'gradle-server.bat';
  } else if (platform === 'linux' || platform === 'darwin') {
    return 'gradle-server';
  } else {
    throw new Error('Unsupported platform');
  }
}

export interface ProcessEnv {
  [key: string]: string | undefined;
}

export function getGradleServerEnv(): ProcessEnv {
  const javaHome = getConfigGradleJavaHome();
  const env = { ...process.env };
  if (javaHome) {
    Object.assign(env, {
      VSCODE_JAVA_HOME: javaHome,
    });
  }
  return env;
}
