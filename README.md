# vscode-gradle

<a href="https://marketplace.visualstudio.com/items?itemName=richardwillis.vscode-gradle">![Marketplace extension](https://img.shields.io/visual-studio-marketplace/i/richardwillis.vscode-gradle)</a>

<!-- ![Build status](https://github.com/badsyntax/vscode-gradle/workflows/Node%20CI/badge.svg) -->

This extension provides support to run gradle tasks.

![Main image](images/task-list.png)

## Usage

Run any of the following commands:

- `Gradle: Run task`
- `Gradle: Refresh tasks`
- `Gradle: Kill all tasks`

Or run gradle tasks from the explorer.

## Settings

Use global `gradlew`:

```json
"gradle.useCommand": "gradlew"
```

Use local `gradlew` (default):

```json
"gradle.useCommand": "./gradlew"
```

Use project tasks:

```json
"gradle.tasks.args": ""
```

Use all tasks (default):

```json
"gradle.tasks.args": "--all"
```

Disable tasks explorer:

```json
"gradle.enableTasksExplorer": false
```

Enable tasks explorer (default):

```json
"gradle.enableTasksExplorer": true
```

## Features

- List gradle tasks in the Command Palette
- List gradle tasks in the Explorer
- Read project or all tasks (via custom gradle tasks arguments)
- Run gradle tasks (via Command Palette or Explorer) and view output
- Load tasks when `build.gradle` file is found in root workspace
- Refresh tasks when `build.gradle` changes
- Kill gradle task processes

## Troubleshooting

<details><summary>The extension hangs with "Refreshing gradle tasks"...</summary>

Eventually the command should fail with an error message. This is usually due to gradle not being able to resolve dependencies. Check your network connection.

</details>

<details><summary>The extension show an error "Unable to refresh gradle tasks: Command failed: Error: spawn gradlew..."</summary>

This means the global `gradlew` command is not available. Change the command setting to point to a local `gradlew` command:

```json
"gradle.useCommand": "./gradlew"
```

</details>

## Credits

This project is a fork of [Cazzar/vscode-gradle](https://github.com/Cazzar/vscode-gradle), which is no longer maintained.

## TODO

See [TODO.md](./TODO.md).

## License

See [LICENSE.md](./LICENSE.md).
