import * as path from 'path';
import * as vscode from 'vscode';
import * as Mocha from 'mocha';
import * as glob from 'glob';

export async function waitForExplorerRefresh(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extension: any
): Promise<vscode.Task[]> {
  return await new Promise(async (resolve) => {
    extension.exports.treeDataProvider.onDidChangeTreeData(async () => {
      const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
      if (tasks.length) {
        resolve(tasks);
      }
    });
  });
}

export async function waitForTasksToLoad(
  extensionName: string
): Promise<vscode.Task[]> {
  const extension = vscode.extensions.getExtension(extensionName);
  const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
  if (!tasks || !tasks.length) {
    return await waitForExplorerRefresh(extension);
  } else {
    return tasks;
  }
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
      timeout: 90000,
    });
    mocha.useColors(true);

    glob(pattern, { cwd: testsRoot }, (err, files) => {
      if (err) {
        return cb(err);
      }

      // Add files to the test suite
      files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        // Run the mocha test
        mocha.run((failures) => {
          cb(null, failures);
        });
      } catch (e) {
        cb(e);
      }
    });
  };
}
