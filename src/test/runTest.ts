import * as path from 'path';

import { runTests } from 'vscode-test';

const extensionDevelopmentPath = path.resolve(__dirname, '../../');

async function runTestsWithGradle() {
  const fixtures = [
    'gradle-groovy-default-build-file',
    'gradle-kotlin-default-build-file',
    'gradle-groovy-custom-build-file'
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

async function runTestsWithoutGradle() {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, './no-gradle'),
    launchArgs: [
      path.resolve(__dirname, '../../test-fixtures/no-gradle'),
      '--disable-extensions'
    ]
  });
}

async function runTestsWithMultiRoot() {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, './multi-root'),
    launchArgs: [
      path.resolve(
        __dirname,
        '../../test-fixtures/multi-root/multiple-project.code-workspace'
      ),
      '--disable-extensions'
    ],
    extensionTestsEnv: {
      FIXTURE_NAME: 'multi-root'
    }
  });
}

async function main() {
  try {
    await runTestsWithGradle();
    await runTestsWithMultiRoot();
    await runTestsWithoutGradle();
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
