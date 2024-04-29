# Contributing

## How to Contribute

Start by opening an issue using one of the issue templates, or propose a change by submitting a pull request (including a detailed pull request description).

## Running the Project

### Build Gradle Server and Gradle Language Server.
1. Install [nvm](https://github.com/nvm-sh/nvm)
2. Install [Java version >= 8](https://adoptium.net/)
3. Change directory to the root of the project
4. Select Node version: `nvm use`
5. If using an Apple M1:
    - Add `npm_arch=x64` to $HOME/.gradle/gradle.properties
    - Add `protoc_platform=osx-x86_64` to $HOME/.gradle/gradle.properties
6. If using Windows:
    - The extension uses `grpc-tools@1.12.x` dependency which does not work out-of-the-box in Windows (check [this issues](https://github.com/grpc/grpc-node/issues/2338) for details), so you'll need to install some aditional DLLs if the project build is failed.
    - Download and start [Build Tools for Visual Studio 2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022).
    - Go to the **Individual Components** tab and select the following:
      - `MSVC v143 - VS 2022 C++ x64/x86 build tools (latest)` (replacing `x64/x86` with your arch)
      - `Windows Universal CRT SDK`
    - Click `Install` to add the components.
7. Build project files: `./gradlew build`

Running the build for the first time can take a bit of time, but subsequent builds should be fast.

### Build Gradle Project Importer
1. Install [Java version >= 17](https://adoptium.net/)
2. `cd extension`
3. `git clone https://github.com/microsoft/build-server-for-gradle.git `
4. Build the Importer and Build Server jars: `../gradlew buildJars`

## Debugging Gradle plugin

The extension uses a Gradle plugin (`com.microsoft.gradle.GradlePlugin`) to get a lot of information from your project's Gradle build. If you want to debug the Gradle plugin, you can follow these steps:

1. Run vscode launch configuration `Debug Extension & Gradle Plugin`.
2. Run vscode launch configuration `Attach to Gradle Plugin`.

> Note: There is a known issue that when the Gradle project stores in a sub-folder of the root folder, the `Attach to Gradle Plugin` will fail to attach. See [#1237](https://github.com/microsoft/vscode-gradle/issues/1237).

## Debugging Gradle Build Server

To debug the Extension with the [Gradle Build Server](https://github.com/microsoft/build-server-for-gradle), follow these steps:

1. Open the `extension/build-server-for-gradle` directory, which you should have [imported previously](#build-gradle-project-importer) as a separate project.
2. In the `.vscode/launch.json` of the build-server-for-gradle project, ensure you have the following configuration to attach the debugger:
   ```json
   {
     "type": "java",
     "name": "Attach to Gradle Build Server",
     "request": "attach",
     "hostName": "localhost",
     "port": "8989",
     "projectName": "server"
   }
   ```
3. In your main project (vscode-gradle), start the `Debug Extension & Build Server` launch configuration.
4. In the build-server-for-gradle project, start the `Attach to Gradle Build Server` launch configuration.

## Debugging Gradle Language Server (editing feature related)

1. Run vscode launch configuration `Debug Language Server: Launch Extension`.
2. Run vscode launch configuration `Debug Language Server: Launch Language Server`.

## Debugging Gradle Server (work with Gradle daemon)

Run vscode launch configuration `Debug Server & Extension`.

## Development Workflow

Open the root of the project in VS Code.

Open the Debug panel, and select one of the `debug` tasks, for example `Debug Extension`, or any of the test launch configurations.

You can also run `./gradlew build testVsCode` to run all tests.

### Code Style

Prettier is used to lint & format most files.

- Lint: `./gradlew lint`
- Fix linting issues: `./gradlew format`
