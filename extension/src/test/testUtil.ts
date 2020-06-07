import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';

export const EXTENSION_NAME = 'richardwillis.vscode-gradle';

export function createTestRunner(pattern: string) {
  return function run(
    testsRoot: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb: (error: any, failures?: number) => void
  ): void {
    // Create the mocha test
    const mocha = new Mocha({
      ui: 'bdd',
      timeout: 60000,
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

export function getSuiteName(subSuiteName: string): string {
  const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';
  const suiteName = process.env.SUITE_NAME || '(unknown suite)';
  return `${suiteName} - ${subSuiteName} - ${fixtureName}`;
}
