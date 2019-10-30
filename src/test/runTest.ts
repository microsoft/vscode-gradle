import * as path from 'path';

import { runTests } from 'vscode-test';

const extensionDevelopmentPath = path.resolve(__dirname, '../../');

async function runTestsWithGradleWorkspace() {
  const fixtures = [
    'gradle-groovy-default-build-file',
    'gradle-kotlin-default-build-file',
    'gradle-groovy-custom-build-file',
    'gradle-groovy-custom-build-via-settings'
  ];
  for (const fixture of fixtures) {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath: path.resolve(__dirname, './gradle'),
      launchArgs: [
        path.resolve(__dirname, `../../test-fixtures/${fixture}`),
        '--disable-extensions'
      ],
      extensionTestsEnv: {
        FIXTURE_NAME: fixture.replace(/-/g, ' ')
      }
    });
  }
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
