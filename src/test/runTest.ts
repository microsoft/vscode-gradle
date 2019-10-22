import * as path from 'path';

import { runTests } from 'vscode-test';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath: path.resolve(__dirname, './gradle'),
      launchArgs: [
        path.resolve(__dirname, '../../test-fixtures/gradle'),
        '--disable-extensions'
      ]
    });

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath: path.resolve(__dirname, './no-gradle'),
      launchArgs: [
        path.resolve(__dirname, '../../test-fixtures/no-gradle'),
        '--disable-extensions'
      ]
    });
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
