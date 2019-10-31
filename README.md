# vscode-gradle

<a href="https://marketplace.visualstudio.com/items?itemName=richardwillis.vscode-gradle">![Marketplace extension](https://img.shields.io/visual-studio-marketplace/i/richardwillis.vscode-gradle)</a>

Run gradle tasks in VS Code.

![Screencat](images/screencast.gif)

## Features

- Run gradle tasks as [VS Code tasks](https://code.visualstudio.com/docs/editor/tasks)
- List & run gradle tasks in the Explorer
- Multi-root workspaces supported
- Default Groovy/Kotlin and custom build files supported

> **Note:** Local gradle wrapper executables must exist at the root of the workspace folders (either `./gradlew` or `.\gradlew.bat`, depending on your environment).

## Extension Settings

This extension contributes the following settings:

- `gradle.autoDetect`: Automatically detect gradle tasks
- `gradle.tasksArgs`: Custom gradle tasks arguments
- `gradle.enableTasksExplorer`: Enable an explorer view for gradle tasks
- `gradle.customBuildFile`: Custom gradle build filename

## Credits

- Originally forked from [Cazzar/vscode-gradle](https://github.com/Cazzar/vscode-gradle)
- Heavily inspired by the built-in [npm extension](https://github.com/microsoft/vscode/tree/master/extensions/npm)

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md)

## License

See [LICENSE.md](./LICENSE.md)
