import * as path from 'path';

import { runTests } from 'vscode-test';

const extensionDevelopmentPath = path.resolve(__dirname, '../../');

async function runTestsWithGradleWorkspace() {
  const fixtureName =
    process.platform === 'win32' ? 'gradle-windows' : 'gradle';
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, './gradle'),
    launchArgs: [
      path.resolve(__dirname, `../../test-fixtures/${fixtureName}`),
      '--disable-extensions'
    ]
  });
}

async function runTestsWithoutGradleWorkspace() {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, './no-gradle'),
    launchArgs: [
      path.resolve(__dirname, '../../test-fixtures/no-gradle'),
      '--disable-extensions'
    ]
  });
}

async function main() {
  try {
    await runTestsWithGradleWorkspace();
    await runTestsWithoutGradleWorkspace();
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
