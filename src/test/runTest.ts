import * as path from 'path';

import { runTests } from 'vscode-test';

async function main() {
  try {
    const testWorkspaces = [
      path.resolve(__dirname, '../../test-fixtures/gradle')
    ];

    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    testWorkspaces.forEach(async testWorkspace => {
      const launchArgs = [testWorkspace, '--disable-extensions'];

      // Download VS Code, unzip it and run the integration test
      await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs
      });
    });
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
