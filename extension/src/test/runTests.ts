/* eslint-disable sonarjs/no-duplicate-string */
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';

import { runTests, downloadAndUnzipVSCode } from 'vscode-test';

const extensionDevelopmentPath = path.resolve(__dirname, '../../');
const VSCODE_VERSION = 'insiders';

async function runTestsWithGradle(
  vscodeExecutablePath: string,
  userDir: string
): Promise<void> {
  const fixtures = [
    'gradle-groovy-default-build-file',
    'gradle-kotlin-default-build-file',
    'gradle-groovy-custom-build-file',
  ];
  for (const fixture of fixtures) {
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath: path.resolve(__dirname, 'integration', 'gradle'),
      launchArgs: [
        path.resolve(__dirname, `../../test-fixtures/${fixture}`),
        '--disable-extensions',
        `--user-data-dir=${userDir}`,
      ],
      extensionTestsEnv: {
        FIXTURE_NAME: fixture,
        SUITE_NAME: 'Run tests with Gradle',
        VSCODE_TEST: 'true',
      },
    });
  }
}

async function runNetworkTestsWithGradle(
  vscodeExecutablePath: string,
  userDir: string
): Promise<void> {
  const fixture = 'gradle-groovy-default-build-file';
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'integration', 'gradle'),
    launchArgs: [
      path.resolve(__dirname, `../../test-fixtures/${fixture}`),
      '--disable-extensions',
      `--user-data-dir=${userDir}`,
    ],
    extensionTestsEnv: {
      FIXTURE_NAME: fixture,
      VSCODE_TEST: 'true',
      SUITE_NAME: 'Run network tests with Gradle',
      // eslint-disable-next-line @typescript-eslint/camelcase
      http_proxy: 'http://0.0.0.0',
    },
  });
}

async function runUnitTests(
  vscodeExecutablePath: string,
  userDir: string
): Promise<void> {
  const fixture = 'no-gradle';
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'unit'),
    launchArgs: [
      path.resolve(__dirname, `../../test-fixtures/${fixture}`),
      '--disable-extensions',
      `--user-data-dir=${userDir}`,
    ],
    extensionTestsEnv: {
      FIXTURE_NAME: fixture,
      VSCODE_TEST: 'true',
      SUITE_NAME: 'Run unit tests',
    },
  });
}

function runTestsWithoutGradle(
  vscodeExecutablePath: string,
  userDir: string
): Promise<number> {
  return runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'integration', 'no-gradle'),
    launchArgs: [
      path.resolve(__dirname, '../../test-fixtures/no-gradle'),
      '--disable-extensions',
      `--user-data-dir=${userDir}`,
    ],
    extensionTestsEnv: {
      VSCODE_TEST: 'true',
      SUITE_NAME: 'Run tests without Gradle',
    },
  });
}

function runTestsWithMultiRoot(
  vscodeExecutablePath: string,
  userDir: string
): Promise<number> {
  return runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'integration', 'multi-root'),
    launchArgs: [
      path.resolve(
        __dirname,
        '../../test-fixtures/multi-root/multiple-project.code-workspace'
      ),
      '--disable-extensions',
      `--user-data-dir=${userDir}`,
    ],
    extensionTestsEnv: {
      FIXTURE_NAME: 'multi-root',
      VSCODE_TEST: 'true',
      SUITE_NAME: 'Run tests with multi-root vscode project',
    },
  });
}

function runTestsWithMultiProject(
  vscodeExecutablePath: string,
  userDir: string
): Promise<number> {
  return runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'integration', 'multi-project'),
    launchArgs: [
      path.resolve(__dirname, '../../test-fixtures/multi-project/'),
      '--disable-extensions',
      `--user-data-dir=${userDir}`,
    ],
    extensionTestsEnv: {
      FIXTURE_NAME: 'multi-project',
      VSCODE_TEST: 'true',
      SUITE_NAME: 'Run tests with Gradle multi-project',
    },
  });
}

async function main(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-user'));
  fs.copySync(
    path.resolve(__dirname, '../../test-fixtures/vscode-user/User'),
    path.join(tmpDir, 'User')
  );
  const vscodeExecutablePath = await downloadAndUnzipVSCode(VSCODE_VERSION);

  let hasErr = false;

  try {
    await runUnitTests(vscodeExecutablePath, tmpDir);
    await runTestsWithGradle(vscodeExecutablePath, tmpDir);
    await runNetworkTestsWithGradle(vscodeExecutablePath, tmpDir);
    await runTestsWithMultiRoot(vscodeExecutablePath, tmpDir);
    await runTestsWithMultiProject(vscodeExecutablePath, tmpDir);
    await runTestsWithoutGradle(vscodeExecutablePath, tmpDir);
  } catch (err) {
    hasErr = true;
    console.error('Error running tests:', err.message);
  } finally {
    fs.remove(tmpDir);
    if (hasErr) {
      process.exit(1);
    }
  }
}

main();
