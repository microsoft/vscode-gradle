# vscode-gradle

<a href="https://marketplace.visualstudio.com/items?itemName=richardwillis.vscode-gradle">![Marketplace extension](https://img.shields.io/visual-studio-marketplace/i/richardwillis.vscode-gradle)</a>

<!-- <a href="https://github.com/badsyntax/vscode-gradle/actions?workflow=Node+CI+Test"><img src="https://github.com/badsyntax/vscode-gradle/workflows/Node%20CI%20Test/badge.svg" /></a>  -->

<!-- ![Build status](https://github.com/badsyntax/vscode-gradle/workflows/Node%20CI/badge.svg) -->

Run gradle tasks in VS Code.

<img src="images/screencast.gif" style="max-width:700px;width:100%" />

## Features

- Run gradle tasks as [VS Code tasks](https://code.visualstudio.com/docs/editor/tasks)
- Run gradle tasks in the Explorer
- Multi-root workspaces supported

> **Note:** Local gradle wrapper executables must exist at the root of the workspace folders (either `./gradlew` or `.\gradlew.bat`, depending on your environment).

## Settings

```json
"gradle.autoDetect": "on",         // Automatically detect gradle tasks
"gradle.tasksArgs": "--all",       // Custom gradle tasks arguments
"gradle.enableTasksExplorer": true // Enable an explorer view for gradle tasks
```

## Troubleshooting

<details><summary>The extension hangs with "Refreshing gradle tasks"...</summary>

Eventually the command should fail with an error message. This is usually due to gradle not being able to resolve dependencies. Check your network connection.

</details>

## Credits

Originally forked from [Cazzar/vscode-gradle](https://github.com/Cazzar/vscode-gradle).

Heavily inspired by the built-in [npm extension](https://github.com/microsoft/vscode/tree/master/extensions/npm).

## License

See [LICENSE.md](./LICENSE.md).
