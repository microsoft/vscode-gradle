# Contributing

## How to Contribute

Start by opening an issue using one of the issue templates, or propose a change by submitting a pull request (including a detailed pull request description).

## Running the Project

1. Install [nvm](https://github.com/nvm-sh/nvm)
2. Install [Java version >= 8](https://adoptopenjdk.net/)
3. Change directory to the root of the project
4. Select Node version: `nvm use`
5. If using an Apple M1:
   - Add `npm_arch=x64` to $HOME/.gradle/gradle.properties
   - Add `protoc_platform=osx-x86_64` to $HOME/.gradle/gradle.properties
6. Build project files: `./gradlew build`

Running the build for the first time can take a bit of time, but subsequent builds should be fast.

## Debugging Gradle plugin

The extension uses a Gradle plugin (`com.microsoft.gradle.GradlePlugin`) to get a lot of information from your project's Gradle build. If you want to debug the Gradle plugin, you can follow these steps:

1. Run vscode launch configuration `Debug Extension & Gradle Plugin`
2. Run vscode launch configuration `Attach to Gradle Plugin`

## Development Workflow

Open the root of the project in VS Code.

Open the Debug panel, and select one of the `debug` tasks, for example `Debug Extension`, or any of the test launch configurations.

You can also run `./gradlew build testVsCode` to run all tests.

### Code Style

Prettier is used to lint & format most files.

- Lint: `./gradlew lint`
- Fix linting issues: `./gradlew format`
