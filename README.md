# Gradle Tasks

[![Marketplace Version](https://vsmarketplacebadge.apphb.com/version-short/richardwillis.vscode-gradle.svg)](https://marketplace.visualstudio.com/items?itemName=richardwillis.vscode-gradle)
[![Build status](https://img.shields.io/github/workflow/status/badsyntax/vscode-gradle/Build)](https://github.com/badsyntax/vscode-gradle/actions?query=workflow%3ABuild)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=badsyntax_vscode-gradle&metric=security_rating)](https://sonarcloud.io/dashboard?id=badsyntax_vscode-gradle)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/richardwillis.vscode-gradle)](https://marketplace.visualstudio.com/items?itemName=richardwillis.vscode-gradle)
[![GitHub issues by-label](https://img.shields.io/github/issues/badsyntax/vscode-gradle/bug?color=red&label=bug%20reports)](https://github.com/badsyntax/vscode-gradle/issues?q=is%3Aissue+is%3Aopen+label%3Abug)

Run Gradle tasks in VS Code.

![Screencat](images/screencast.gif)

## Features

- Run [Gradle tasks](https://gradle.org/) as [VS Code tasks](https://code.visualstudio.com/docs/editor/tasks)
- List & run Gradle tasks in the Explorer
- [More Features »](./FEATURES.md)

## Requirements

- [Java >= 8](https://adoptopenjdk.net/) must be installed
- Local Gradle wrapper executables must exist at the root of the workspace folders (either `gradlew` or `gradlew.bat`, depending on your environment)

## Extension Settings

This extension contributes the following settings:

- `gradle.autoDetect`: Automatically detect Gradle tasks
- `gradle.enableTasksExplorer`: Enable an explorer view for Gradle tasks
- `gradle.debug`: Show extra debug info in the output panel

## Snippets

This extensions provides snippets for the groovy and kotlin build files:

- `cgt`: Create a new Gradle task

## Troubleshooting

<details><summary>View logs by selecting "Gradle Tasks" in the output panel</summary>

<img src="./images/output.png" width="600" />

</details>

<details><summary>Task output will be shown in the Terminal panel</summary>

<img src="./images/terminal.png" width="600" />

</details>

<details><summary>Set the "gradle.debug" setting to "true" to view debug logs in the output panel</summary>

<img src="./images/debug-output.png" width="600" />

</details>

<details><summary>"No connection to the gradle server. Try restarting the server"</summary>

<img src="./images/no-connection.png" width="400" />

This error means the gradle server task has stopped. Try clicking on "Restart Server".

If you continue to get this error, you can view the task error messages by selecting "Gradle Tasks Server" in the Terminal panel.

The following error suggests an issue with your `$PATH`:

```shell
env: sh: No such file or directory
The terminal process terminated with exit code: 127
```

Use the following task to debug your shell environment within vscode:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Print task shell info",
      "type": "shell",
      "command": "echo \"Path: $PATH \nShell: $SHELL\"",
      "problemMatcher": []
    }
  ]
}
```

</details>

## Contributing

Refer to [CONTRIBUTING.md](./CONTRIBUTING.md) for instructions on how to run the project.

- 👉 [Submit a bug report](https://github.com/badsyntax/vscode-gradle/issues/new?assignees=badsyntax&labels=bug&template=bug_report.md&title=)
- 👉 [Submit a feature request](https://github.com/badsyntax/vscode-gradle/issues/new?assignees=badsyntax&labels=enhancement&template=feature_request.md&title=)

## Credits

- Originally forked from [Cazzar/vscode-gradle](https://github.com/Cazzar/vscode-gradle)
- Inspired by the built-in [npm extension](https://github.com/microsoft/vscode/tree/master/extensions/npm)

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md).

## License

See [LICENSE.md](./LICENSE.md).
