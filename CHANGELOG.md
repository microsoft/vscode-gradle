# Change Log

## 2.3.0

- Performance improvements, for both listing and running tasks (using websocket server)
- Better feedback shown in the statusbar when refreshing or running tasks
- Use gradle cancellation tokens for clean shutdown of gradle processes
- Add information message dialog on statusbar item click, to view logs or cancel refresh process

## 2.2.6

- Fix task label containing project directory name in explorer for nested projects

## 2.2.5

- Add support for nested gradle projects (#88)
- Add Troubleshooting section to README

## 2.2.4

- Tooling upgrades (replaced tslint with eslint, added sonarqube)
- Improved gradle-tasks process logging

## 2.2.3

- Fixed refresh process not completing when build file has errors

## 2.2.2

- Add feature to run task with custom args

## 2.2.1

- Fix publishing jar file

## 2.2.0

- Use gradle tooling API to list tasks
- Add groups to explorer
- Add flat/tree toggle to explorer
- Add command to kill refresh tasks process
- Proper support for sub-projects/multi-project builds

## 2.1.9

- Add loading state and stop command to the explorer view
- Add snippets and basic support for adding new gradle tasks

## 2.1.8

- Fix sub-project build file uri

## 2.1.7

- Change gradle task definition for better support with other task extensions
- Add open build file task content menu action to explorer
- Add community docs
- Better dev tooling & linting

## 2.1.6

- Add support for multi-project builds (subprojects)

## 2.1.5

- Improve error handling

## 2.1.4

- Fix refresh tasks error handling

## 2.1.3

- Fix gradle tasks parsing #19
- Remove progress notification #33

## 2.1.2

- Fixed parsing massive tasks list

## 2.1.1

- Add support for git bash on Windows

## 2.1.0

- Custom build file support
- Fix background refreshing process when explorer is closed

## 2.0.0

- Gradle tasks now run as VS Code tasks
- Improvements to the Gradle Tasks Explorer
- Auto-discover gradle wrapper executable
- Refactored to follow vscode exteiion standards

## 1.1.0

- Add treeview explorer to list & run gradle tasks

## 1.0.0

Improved version from initial fork.

- Process & tasks registry
- Activation events
- Linting and formatting
- Upgraded packages
