# Contributing

## How to Contribute

Start by opening an issue using one of the issue templates, or propose a change by submitting a pull request (including a detailed pull request description).

## Running the Project

### Prerequisites
1. Install [nvm](https://github.com/nvm-sh/nvm)
2. Install [Java version >= 17](https://adoptium.net/)
3. Select Node version: `nvm use`
4. If using an Apple M1:
    - Add `npm_arch=x64` to $HOME/.gradle/gradle.properties
    - Add `protoc_platform=osx-x86_64` to $HOME/.gradle/gradle.properties
5. If using Windows:
    - The extension uses `grpc-tools@1.12.x` dependency which does not work out-of-the-box in Windows (check [this issues](https://github.com/grpc/grpc-node/issues/2338) for details), so you'll need to install some aditional DLLs if the project build is failed.
    - Download and start [Build Tools for Visual Studio 2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022).
    - Go to the **Individual Components** tab and select the following:
      - `MSVC v143 - VS 2022 C++ x64/x86 build tools (latest)` (replacing `x64/x86` with your arch)
      - `Windows Universal CRT SDK`
    - Click `Install` to add the components.

### Build Gradle Build Server & Gradle Project Importer
Before proceeding with the build steps for Build Task Server & Language Server, you need to build the Gradle Build Server and its client (Gradle Project Importer) first.

1. `cd extension`
2. `git clone https://github.com/microsoft/build-server-for-gradle.git `
3. Build the Importer and Build Server jars: `../gradlew buildJars`

### Build Task Server & Language Server
After building the Gradle Build Server and its client, proceed with the following steps.

1. Change directory to the root of the project

2. Build project files: `./gradlew build`

Running the build for the first time can take a bit of time, but subsequent builds should be fast.

## Debugging Gradle plugin

The extension uses a Gradle plugin (`com.microsoft.gradle.GradlePlugin`) to get a lot of information from your project's Gradle build. If you want to debug the Gradle plugin, you can follow these steps:

1. Run vscode launch configuration `Debug Extension & Gradle Plugin`.
2. Run vscode launch configuration `Attach to Gradle Plugin`.

> Note: There is a known issue that when the Gradle project stores in a sub-folder of the root folder, the `Attach to Gradle Plugin` will fail to attach. See [#1237](https://github.com/microsoft/vscode-gradle/issues/1237).

## Debugging Gradle Server

1. Run vscode launch configuration `Debug Gradle Server & Extension`.
2. Run vscode launch configuration `Attach to Gradle Server` when you notice the `Gradle: Connecting...` message in the bottom status bar.

> **Note:** If `[error] Error connecting to gradle server: Failed to connect before the deadline`  appears in the `Gradle for Java` output channel, it indicates that the connection attempt to the Gradle Server was too slow. The [GradleBuildClient](/extension/jdtls.ext/com.microsoft.gradle.bs.importer/src/com/microsoft/gradle/bs/importer/ImporterPlugin.java#L107) requires an active Gradle Server to successfully establish a connection. If you encounter this issue, please retry the connection promptly to avoid this error.

## Development Workflow

Open the root of the project in VS Code.

Open the Debug panel, and select one of the `debug` tasks, for example `Debug Extension`, or any of the test launch configurations.

You can also run `./gradlew build testVsCode` to run all tests.

### Code Style

Prettier is used to lint & format most files.

- Lint: `./gradlew lint`
- Fix linting issues: `./gradlew format`
