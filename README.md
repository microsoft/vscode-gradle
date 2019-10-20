# VSCode-Gradle

<a href="https://marketplace.visualstudio.com/items?itemName=richardwillis.vscode-gradle">![Marketplace extension](https://img.shields.io/visual-studio-marketplace/i/richardwillis.vscode-gradle)</a>

<!-- ![Build status](https://github.com/badsyntax/vscode-gradle/workflows/Node%20CI/badge.svg) -->

This extension provides support to run gradle tasks.

![Main image](images/main.png)

## Usage

Run any of the following commands:

- "Gradle: Run task"
- "Gradle: Refresh tasks"
- "Gradle: Kill all tasks"

## Config

Use local `gradlew`:

```json
"gradle.useCommand": "./gradlew"
```

Use global `gradlew` (default):

```json
"gradle.useCommand": "gradlew"
```

Use project tasks:

```json
"gradle.tasks.args": ""
```

Use all tasks (default):

```json
"gradle.tasks.args": "--all"
```

## Features

- List gradle tasks, either project or all tasks (via custom gradle tasks arguments)
- Run gradle tasks and view output
- Load tasks when `build.gradle` file is found in root workspace
- Refresh tasks when `build.gradle` changes
- Kill gradle task processes

## Credits

This project is a fork of [Cazzar/vscode-gradle](https://github.com/Cazzar/vscode-gradle), which is no longer maintained.

## TODO

See [TODO.md](./TODO.md).

## License

See [LICENSE.md](./LICENSE.md).
