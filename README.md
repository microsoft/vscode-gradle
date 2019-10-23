# vscode-gradle

<a href="https://marketplace.visualstudio.com/items?itemName=richardwillis.vscode-gradle">![Marketplace extension](https://img.shields.io/visual-studio-marketplace/i/richardwillis.vscode-gradle)</a>

<!-- ![Build status](https://github.com/badsyntax/vscode-gradle/workflows/Node%20CI/badge.svg) -->

Run gradle tasks in VS Code.

![Main image](images/task-list.png)

## Features

- List gradle tasks in the Command Palette
- List gradle tasks in the Explorer
- Read project or all tasks (via custom gradle tasks arguments)
- Run gradle tasks (via Command Palette or Explorer) and view output
- Load tasks when `build.gradle` file is found in root workspace
- Refresh tasks when `build.gradle` changes
- Kill gradle task processes

## Setup

The extension requires a local gradle wrapper executable at the root of the workspace.

You can configure this with the `gradle.useCommand` setting:

### Linux/MacOS (default):

```json
{
  "gradle.useCommand": "./gradlew"
}
```

### Windows:

```json
{
  "gradle.useCommand": ".\\gradlew.bat"
}
```

## Usage

Run any of the following commands:

- `Gradle: Run task`
- `Gradle: Refresh tasks`
- `Gradle: Kill all tasks`

Or run gradle tasks from the explorer.

## Settings

```json
"gradle.useCommand": "./gradlew",  // path to local gradle wrapper
"gradle.tasks.args": "--all",      // gradle tasks args
"gradle.enableTasksExplorer": true // show gradle tasks in the explorer
```

## Troubleshooting

<details><summary>The extension hangs with "Refreshing gradle tasks"...</summary>

Eventually the command should fail with an error message. This is usually due to gradle not being able to resolve dependencies. Check your network connection.

</details>

<details><summary>The extension show an error "Unable to refresh gradle tasks: Command failed..."</summary>

The path to the gradle wrapper does not exist. Change the `"gradle.useCommand"` setting to point to a local `gradlew` executable.

</details>

## Credits

This project is a fork of [Cazzar/vscode-gradle](https://github.com/Cazzar/vscode-gradle), which is no longer maintained.

## TODO

See [TODO.md](./TODO.md).

## License

See [LICENSE.md](./LICENSE.md).
