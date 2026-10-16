# Contributing

## How to Contribute

Start by opening an issue using one of the issue templates, or propose a change by submitting a pull request (including a detailed pull request description).

## Running the Project

### Prerequisites
1. Install [nvm](https://github.com/nvm-sh/nvm)
2. Install [JDK 25](https://adoptium.net/) and set `JAVA_HOME` to its installation directory.
   The repository's Gradle build and the Gradle Project Importer both use this JDK.
3. Select Node version: `nvm use`
4. If using an Apple M1:
    - Add `npm_arch=x64` to $HOME/.gradle/gradle.properties
    - Add `protoc_platform=osx-x86_64` to $HOME/.gradle/gradle.properties
5. If using Windows:
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

The importer's target platform intentionally tracks the latest JDT LS snapshot so that upstream
compatibility changes are caught by the build. Gradle 9.8.1 and the importer's Maven build both run
on JDK 25. The importer resolves and tests against a Java 25 environment while retaining its
Java 21 bundle execution environment and bytecode target.

Azure Pipelines installs JDK 25 through `.azure-pipelines/install-jdk.yml`, using the
`jdk25-linux-x64` and `jdk25-windows-x64` Universal Packages in the `VSJava/vscjava` feed.
The pipeline's own credentials read these packages; a preinstalled JDK 25 or cross-organization
service connection is not required. To update the JDK patch version, publish both platform
packages and update the pinned package version and archive names in the template together.
Java 21 remains preinstalled for the existing Gradle 8.5 compatibility tests; it is not
needed to build the repository or importer.

Run the BSP importer's Java regression tests from the repository root:

```powershell
.\gradlew.bat :extension:buildJdtlsPlugin
```

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

The VS Code test runner saves a separate log directory for each extension host under
`extension/.vscode-test/logs`. On failure it prints the last 200 lines of the extension-host
and Gradle output logs, including task-server startup and Gradle model-loading errors.
Azure CI runs the full build and VS Code tests for pull requests as well as branch builds;
dependency validation alone does not cover these tests.

### Gradle 9.8.1 / Java 27 Compatibility

Build the importer, BSP server, task server and extension as above, using JDK 25 for the repository build. Then run the dedicated live compatibility suite with JDK 25 and JDK 27 installed:

```powershell
$env:JDK25_HOME = 'C:\path\to\jdk-25'
$env:JDK27_HOME = 'C:\path\to\jdk-27'
Set-Location extension
node .\out\test\runCompatibilityTests.js
```

On headless Linux, use `xvfb-run -a node out/test/runCompatibilityTests.js`. Set `GRADLE_COMPATIBILITY_DAEMON` to `25` or `27` to run just one scenario. Without it, both run: a wrapper-disabled Gradle 9.8.1 fallback on Java 27, and the 9.8.1 wrapper with Java 25 services/daemon and a Java 27 project toolchain. The suite installs an isolated, universal Java extension (without an embedded JRE) and Java debugger, checks actual BSP import/source/target/runtime, task and dependency models, JUnit results, and real JavaExec/Test breakpoint hits with a Java 27 debuggee. It stops only daemons in its own Gradle user home. Failed workspaces are retained under `extension/.vscode-test` for diagnosis.

Keep `build.gradle`'s `toolingAPIVersion` and `GradleProjectConnector.TOOLING_API_VERSION` synchronized; `GradleToolingApiVersionTest` checks the resolved artifact's manifest against the fallback. Do not replace the older Gradle 8.5 / Java 21 fixtures when updating the new compatibility scenario.

### Code Style

Prettier is used to lint & format most files.

- Lint: `./gradlew lint`
- Fix linting issues: `./gradlew format`
