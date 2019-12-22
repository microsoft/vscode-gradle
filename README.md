# vscode-gradle

[![Marketplace Version](https://vsmarketplacebadge.apphb.com/version-short/richardwillis.vscode-gradle.svg)](https://marketplace.visualstudio.com/items?itemName=richardwillis.vscode-gradle)
[![Build status](https://img.shields.io/github/workflow/status/badsyntax/vscode-gradle/Build)](https://github.com/badsyntax/vscode-gradle/actions?query=workflow%3ABuild)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=badsyntax_vscode-gradle&metric=security_rating)](https://sonarcloud.io/dashboard?id=badsyntax_vscode-gradle)

Run Gradle tasks in VS Code.

![Screencat](images/screencast.gif)

## Features

- Run [Gradle tasks](https://gradle.org/) as [VS Code tasks](https://code.visualstudio.com/docs/editor/tasks)
- List & run Gradle tasks in the Explorer

> **Note:** Local Gradle wrapper executables must exist at the root of the workspace folders (either `./gradlew` or `.\gradlew.bat`, depending on your environment).

## Extension Settings

This extension contributes the following settings:

- `gradle.autoDetect`: Automatically detect Gradle tasks
- `gradle.enableTasksExplorer`: Enable an explorer view for Gradle tasks
- `gradle.debug`: Show extra debug info in the output panel

## Snippets

This extensions provides snippets for the groovy and kotlin build files:

- `cgt`: Create a new Gradle task

## Troubleshooting

<details><summary>View the Gradle Tasks refresh process output and errors by selecting "Gradle Tasks" in the output panel.</summary>

<img src="./images/output.png" width="600" />

</details>

<details><summary>Gradle Task output and errors will be shown in the Terminal panel after you've run a task.</summary>

<img src="./images/terminal.png" width="600" />

</details>

<details><summary>Set the `gradle.debug` setting to `true` to view websocket messages from the server in the output panel.</summary>

<img src="./images/debug-output.png" width="600" />

</details>

## Contributing

Any sort of feedback is helpful, be it a bug report, a feature request or a general comment on the user experience.

- 👉 [Submit a bug report](https://github.com/badsyntax/vscode-gradle/issues/new?assignees=badsyntax&labels=bug&template=bug_report.md&title=)
- 👉 [Submit a feature request](https://github.com/badsyntax/vscode-gradle/issues/new?assignees=badsyntax&labels=enhancement&template=feature_request.md&title=)
- 👉 [Submit general feedack](https://github.com/badsyntax/vscode-gradle/issues/new)

Refer to [CONTRIBUTING.md](./CONTRIBUTING.md) for instructions on how to run the project.

## Credits

- Originally forked from [Cazzar/vscode-gradle](https://github.com/Cazzar/vscode-gradle)
- Heavily inspired by the built-in [npm extension](https://github.com/microsoft/vscode/tree/master/extensions/npm)

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md).

## License

See [LICENSE.md](./LICENSE.md).
