/* eslint-disable sonarjs/no-duplicate-string */
import * as path from 'path';

import { runTests, downloadAndUnzipVSCode } from 'vscode-test';

const extensionDevelopmentPath = path.resolve(__dirname, '../../');
const VSCODE_VERSION = '1.45.0';

async function runTestsWithGradle(vscodeExecutablePath: string): Promise<void> {
  const fixtures = [
    'gradle-groovy-default-build-file',
    'gradle-kotlin-default-build-file',
    'gradle-groovy-custom-build-file',
  ];
  for (const fixture of fixtures) {
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath: path.resolve(__dirname, 'gradle'),
      launchArgs: [
        path.resolve(__dirname, `../../test-fixtures/${fixture}`),
        '--disable-extensions',
      ],
      extensionTestsEnv: {
        FIXTURE_NAME: fixture,
        VSCODE_TEST: 'true',
      },
    });
  }
}

function runTestsWithoutGradle(vscodeExecutablePath: string): Promise<number> {
  return runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'no-gradle'),
    launchArgs: [
      path.resolve(__dirname, '../../test-fixtures/no-gradle'),
      '--disable-extensions',
    ],
    extensionTestsEnv: {
      VSCODE_TEST: 'true',
    },
  });
}

function runTestsWithMultiRoot(vscodeExecutablePath: string): Promise<number> {
  return runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'multi-root'),
    launchArgs: [
      path.resolve(
        __dirname,
        '../../test-fixtures/multi-root/multiple-project.code-workspace'
      ),
      '--disable-extensions',
    ],
    extensionTestsEnv: {
      FIXTURE_NAME: 'multi-root',
      VSCODE_TEST: 'true',
    },
  });
}

async function runTestsWithMultiProject(
  vscodeExecutablePath: string
): Promise<number> {
  return runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'multi-project'),
    launchArgs: [
      path.resolve(__dirname, '../../test-fixtures/multi-project/'),
      '--disable-extensions',
    ],
    extensionTestsEnv: {
      FIXTURE_NAME: 'multi-project',
      VSCODE_TEST: 'true',
    },
  });
}

async function main(): Promise<void> {
  const vscodeExecutablePath = await downloadAndUnzipVSCode(VSCODE_VERSION);

  runTestsWithGradle(vscodeExecutablePath)
    .then(() => runTestsWithMultiRoot(vscodeExecutablePath))
    .then(() => runTestsWithMultiProject(vscodeExecutablePath))
    .then(() => runTestsWithoutGradle(vscodeExecutablePath))
    .catch((err) => {
      console.error('Error running tests:', err.message);
    });
}

main();
