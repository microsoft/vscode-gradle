# Extension API

```ts
interface ExtensionApi {
  runTask(opts: RunTaskOpts): Promise<void>;
  cancelRunTask(opts: CancelTaskOpts): Promise<void>;
}
```

## Installation

```bash
npm install vscode-gradle --save
```

## Usage

```ts
import * as util from "util";
import { ExtensionApi as GradleApi, RunTaskOpts, Output } from "vscode-gradle";

const extension = vscode.extensions.getExtension("vscjava.vscode-gradle");
const gradleApi = extension!.exports as GradleApi;
const runTaskOpts: RunTaskOpts = {
  projectFolder: "/absolute/path/to/project/root",
  taskName: "help",
  showOutputColors: false,
  onOutput: (output: Output): void => {
    const message = new util.TextDecoder("utf-8").decode(
      output.getOutputBytes_asU8()
    );
    console.log(output.getOutputType(), message);
  },
};
await gradleApi.runTask(runTaskOpts);
```

Refer to [vscode-spotless-gradle](https://github.com/badsyntax/vscode-spotless-gradle) for example API usage.

## The `gradle.runBuild` command

The command runs a Gradle build in a task terminal. Without arguments (from the command palette) it asks for the root
project and the command line. Other extensions can pass the arguments to run a build without any interaction:

```ts
await vscode.commands.executeCommand(
  "gradle.runBuild",
  "/absolute/path/to/project/build.gradle", // build file (or directory) of the project, may be of a subproject
  "classes aotClasses", // the Gradle command line: tasks and options
  { JAVA_HOME: "/path/to/jdk" }, // optional environment variables for the build
  { refreshJavaProject: true } // optional, see below
);
```

- The root project is determined from the build file (or directory): it is the closest root project that contains it.
  The build runs in the directory of the build file, as `cd subproject && gradle <tasks>` would.
- `JAVA_HOME` of the environment is the Java home that Gradle runs with, it wins over the one of the extension settings
  (`java.import.gradle.java.home`). All other variables are added to the environment of the Gradle server process.
- With arguments the command completes when the build has ended and fails if the build did not succeed.
- `refreshJavaProject: true` reloads the Java project of the build (the "Update Project" of the Java extension) after the
  build succeeded, for builds that generate sources, for example. If that fails (the Java extension is not installed) it
  is only logged.
