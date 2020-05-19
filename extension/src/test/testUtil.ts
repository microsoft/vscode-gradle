import * as path from 'path';
import * as vscode from 'vscode';
import * as Mocha from 'mocha';
import * as glob from 'glob';

export async function waitForTasksToLoad(
  extensionName: string
): Promise<vscode.Task[]> {
  const extension = vscode.extensions.getExtension(extensionName);
  return new Promise((resolve, reject) => {
    extension?.exports.waitForLoaded(() => {
      vscode.tasks.fetchTasks({ type: 'gradle' }).then(resolve, reject);
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
      timeout: 90000,
      color: true,
    });
    mocha.bail(true);

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
