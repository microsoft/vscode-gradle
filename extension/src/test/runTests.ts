/* eslint-disable sonarjs/no-duplicate-string */
import * as path from 'path';

import { runTests } from 'vscode-test';

const extensionDevelopmentPath = path.resolve(__dirname, '../../');

async function runTestsWithGradle(): Promise<void> {
  const fixtures = [
    'gradle-groovy-default-build-file',
    'gradle-kotlin-default-build-file',
    'gradle-groovy-custom-build-file',
  ];
  for (const fixture of fixtures) {
    await runTests({
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

async function runTestsWithoutGradle(): Promise<void> {
  await runTests({
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

async function runTestsWithMultiRoot(): Promise<void> {
  await runTests({
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

async function runTestsWithMultiProject(): Promise<void> {
  await runTests({
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
  try {
    await runTestsWithGradle();
    await runTestsWithMultiRoot();
    await runTestsWithMultiProject();
    await runTestsWithoutGradle();
  } catch (err) {
    process.exit(1);
  }
}

main();
