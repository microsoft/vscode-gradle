# Contributing

## How to Contribute

Start by opening an issue using one of the issue templates, or propose a change by submitting a pull request (including a detailed pull request description).

## Running the Project

### Prerequisites
1. Install [nvm](https://github.com/nvm-sh/nvm)
2. Install [Java version >= 21](https://adoptium.net/)
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

Run the BSP importer's Java regression tests from the repository root:

```powershell
$env:MAVEN_OPTS = '-Djdk.xml.totalEntitySizeLimit=0 -Djdk.xml.maxGeneralEntitySizeLimit=0'
.\extension\jdtls.ext\mvnw.cmd -B -ntp -f .\extension\jdtls.ext\pom.xml -Declipse.p2.mirrors=false verify
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

### Gradle 9.8.1 / Java 27 Compatibility

Build the importer, BSP server, task server and extension as above, using JDK 21 for the repository build. Then run the dedicated live compatibility suite with JDK 25 and JDK 27 installed:

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

## IssueLens team-memory queue

`.github/workflows/team-memory-post-merge.yml` queues ordinary, non-forced pushes
to this repository's default branch, `develop`, only when the existing
`ISSUELENS_TEAM_MEMORY_ENABLED` variable is `true`. It dispatches
`team-memory-coordinator.yml` in `microsoft/vscode-java-pack` at `main`, independently
of the source branch. The coordinator invokes IssueLens, validates source evidence
and final receipts, and serializes shared-wiki maintenance. Issue triage is unchanged.

Configure the following prerequisites before merging this migration if the
existing source opt-in is already `true`; the migration does not change its value:

- In `microsoft/vscode-gradle`, configure the proposed repository variable
  `ISSUELENS_DISPATCH_APP_CLIENT_ID` and secret
  `ISSUELENS_DISPATCH_APP_PRIVATE_KEY` for a dedicated dispatch App installed only
  on `microsoft/vscode-java-pack`, with **Contents: read** and **Actions: write**.
  The caller's `GITHUB_TOKEN` cannot dispatch across repositories. Do not reuse
  the hosted IssueLens App or the central source-read App credentials.
- In `microsoft/vscode-java-pack`, configure the separate
  `ISSUELENS_SOURCE_READ_APP_CLIENT_ID` and
  `ISSUELENS_SOURCE_READ_APP_PRIVATE_KEY` secrets for the central source-read App,
  with **Actions: read**, **Contents: read**, and **Pull requests: read** access
  to the selected external source, `microsoft/vscode-gradle`. This source is already
  allowlisted; a successful coordinator run against Java Pack itself does not
  verify external-source authentication.

For manual maintenance of a merged PR, use **Run workflow** on Java Pack's
coordinator at `main`, with `source_repository=microsoft/vscode-gradle` and
`pull_request_number` set to the merged PR number. There is no local manual path.
Automatic requests carry five string inputs: the source repository, run ID,
run attempt, `push_before`, and `push_after`. The coordinator verifies the source
run and its head SHA; `push_before` is an authorized reconciliation ancestor,
not attested original-event provenance.

The dispatcher validates the target and sends one bounded POST without retrying.
An accepted dispatch does not confirm coordinator execution or wiki completion.
Inspect central runs before retrying a failed or unknown dispatch outcome.
