export const isTest = (): boolean =>
  process.env.VSCODE_TEST?.toLowerCase() === 'true';

export const isDebuggingServer = (): boolean =>
  process.env.VSCODE_DEBUG_SERVER?.toLowerCase() === 'true';
