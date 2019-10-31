import * as path from 'path';
import Mocha from 'mocha';
import glob from 'glob';

export function createTestRunner(pattern: string) {
  return function run(
    testsRoot: string,
    cb: (error: any, failures?: number) => void
  ): void {
    // Create the mocha test
    const mocha = new Mocha({
      ui: 'tdd',
      timeout: 80000
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
      } catch (err) {
        cb(err);
      }
    });
  };
}
