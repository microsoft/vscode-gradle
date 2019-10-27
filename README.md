# vscode-gradle

<a href="https://marketplace.visualstudio.com/items?itemName=richardwillis.vscode-gradle">![Marketplace extension](https://img.shields.io/visual-studio-marketplace/i/richardwillis.vscode-gradle)</a>

<!-- ![Build status](https://github.com/badsyntax/vscode-gradle/workflows/Node%20CI/badge.svg) -->

Run gradle tasks in VS Code.

![Main image](images/task-list.png)

## Features

- Run gradle tasks as [VS Code tasks](https://code.visualstudio.com/docs/editor/tasks)
- Run gradle tasks in the Explorer
- Multi-root workspaces supported

## Setup

A local gradle wrapper executable must exist at the root of the workspace folders.

### Settings

```json
"gradle.autoDetect": true,         // Automatically detect gradle tasks
"gradle.tasksArgs": "--all",       // Custom gradle tasks arguments
"gradle.enableTasksExplorer": true // Enable an explorer view for gradle tasks
```

## Troubleshooting

<details><summary>The extension hangs with "Refreshing gradle tasks"...</summary>

Eventually the command should fail with an error message. This is usually due to gradle not being able to resolve dependencies. Check your network connection.

</details>

## Credits

This project is a fork of [Cazzar/vscode-gradle](https://github.com/Cazzar/vscode-gradle), which is no longer maintained.

## License

See [LICENSE.md](./LICENSE.md).
