import path from 'path';
import vscode from 'vscode';
import Mocha from 'mocha';
import glob from 'glob';

export async function waitForAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extension: any,
  action: string
): Promise<void> {
  await new Promise(resolve => {
    extension.exports.client.onAction((_action: string) => {
      if (action === _action) {
        resolve();
      }
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function waitForExplorerRefresh(extension: any): Promise<void> {
  await new Promise(async resolve => {
    extension.exports.treeDataProvider.onDidChangeTreeData(async () => {
      const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
      if (tasks.length) {
        resolve();
      }
    });
  });
}

export function createTestRunner(pattern: string) {
  return function run(
    testsRoot: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb: (error: any, failures?: number) => void
  ): void {
    // Create the mocha test
    const mocha = new Mocha({
      ui: 'bdd',
      timeout: 90000
    });
    mocha.useColors(true);

    glob(pattern, { cwd: testsRoot }, (err, files) => {
      if (err) {
        return cb(err);
      }

      // Add files to the test suite
      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        // Run the mocha test
        mocha.run(failures => {
          cb(null, failures);
        });
      } catch (e) {
        cb(e);
      }
    });
  };
}
