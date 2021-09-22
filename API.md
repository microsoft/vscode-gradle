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
