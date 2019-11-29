import * as path from 'path';

import { runTests } from 'vscode-test';

const extensionDevelopmentPath = path.resolve(__dirname, '../../');

async function runUnitTests() {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'unit'),
    launchArgs: [
      path.resolve(
        __dirname,
        '../../test-fixtures/gradle-groovy-default-build-file'
      ),
      '--disable-extensions',
      '--no-sandbox'
    ]
  });
}

async function runTestsWithGradle() {
  const fixtures = [
    'gradle-groovy-default-build-file',
    'gradle-kotlin-default-build-file',
    'gradle-groovy-custom-build-file'
  ];
  for (const fixture of fixtures) {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath: path.resolve(__dirname, 'gradle'),
      launchArgs: [
        path.resolve(__dirname, `../../test-fixtures/${fixture}`),
        '--disable-extensions',
        '--no-sandbox'
      ],
      extensionTestsEnv: {
        FIXTURE_NAME: fixture
      }
    });
  }
}

async function runTestsWithoutGradle() {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'no-gradle'),
    launchArgs: [
      path.resolve(__dirname, '../../test-fixtures/no-gradle'),
      '--disable-extensions',
      '--no-sandbox'
    ]
  });
}

async function runTestsWithMultiRoot() {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'multi-root'),
    launchArgs: [
      path.resolve(
        __dirname,
        '../../test-fixtures/multi-root/multiple-project.code-workspace'
      ),
      '--disable-extensions',
      '--no-sandbox'
    ],
    extensionTestsEnv: {
      FIXTURE_NAME: 'multi-root'
    }
  });
}

async function runTestsWithMultiProject() {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'multi-project'),
    launchArgs: [
      path.resolve(__dirname, '../../test-fixtures/multi-project/'),
      '--disable-extensions',
      '--no-sandbox'
    ],
    extensionTestsEnv: {
      FIXTURE_NAME: 'multi-project'
    }
  });
}

async function main() {
  try {
    await runUnitTests();
    await runTestsWithGradle();
    await runTestsWithMultiRoot();
    await runTestsWithMultiProject();
    await runTestsWithoutGradle();
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
