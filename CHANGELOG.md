# Change Log

> Detailed release notes can be found here: https://github.com/badsyntax/vscode-gradle/releases

## 2.7.1

- Java debug fixes in Windows & additional debugging features (#302) @badsyntax
- Add "Show Gradle Tasks" feature to explorer and editor context menus (#305) @badsyntax

Deps:

- Bump @types/node from 13.13.2 to 13.13.4 in /extension (#303) @dependabot-preview
- Bump mocha from 7.1.1 to 7.1.2 in /extension (#304) @dependabot-preview

## 2.7.0

- Add Java debug feature (#298) @badsyntax
- Use webpack for bundling extension (#296) @badsyntax

## 2.6.2

- Fixed broken extension due to language file change in 2.6.1

## 2.6.1

- Fixed language files not being published (#292)
- Fixed proto source files included in published extension (#293)
- Fixed task cancellation from statusbar
- Updated docs

## 2.6.0

### Internal

- gRPC & build refactor (#272) @badsyntax, which includes:

  - Replace websocket client & server with gRPC 🎉
  - Complete refactor of the build system using Gradle multi-projects for managing the builds
  - Improved developer experience
    - Can now debug both client and server _at the same time_
    - No need for separate & manual steps (eg shell scripts) for generating proto files or building jar files. Just "debug the extension" from VS Code and Gradle will handle the dependencies
  - Improved contribution support
    - The builds work on Linux/MacOS & Windows
    - Improved docs with basic architecture overview
    - Includes VS Code settings & recommended extensions to get VS Code environment setup correctly
  - Less noisy logs - don't show redundant `runTask` logs in the output channel (they are already shown in the terminal)

### Deps

- Bump junit from 4.12 to 4.13 (#288) @dependabot-preview
- Remove grpc_tools_node_protoc_ts dep (#290) @badsyntax
- Bump mockito-core from 2.28.2 to 3.3.3 (#287) @dependabot-preview
- Bump javax.annotation-api from 1.2 to 1.3.2 (#286) @dependabot-preview
- Bump @typescript-eslint/parser from 2.27.0 to 2.28.0 (#271) @dependabot-preview
- Bump eslint-plugin-prettier from 3.1.2 to 3.1.3 (#268) @dependabot-preview
- Bump @types/ws from 7.2.3 to 7.2.4 (#270) @dependabot-preview
- Bump @typescript-eslint/eslint-plugin from 2.27.0 to 2.28.0 (#269) @dependabot-preview

## 2.5.1

- Fix excessive server restart message (#266)
- Update java project config after running tasks. Refs #263 (#264)

## 2.5.0

- Add support for custom java home setting (`java.home`). Refs #249 (#255)

## 2.4.14

- Security & deps update

## 2.4.13

- Improve error logging (#205)
- Task presentation options & focus settings (#199)
- Focus on task in explorer when running task (#197)

## 2.4.12

- Fix task cancelling & minor reorg (#192)
- Rename actions to handlers (#191)
- Show or hide task explorer when changing config (#189)

## 2.4.11

- Better gradle and extension conflict error handling. Refs #99 (#188)
- README improvements

## 2.4.10

- Use Protocol Buffers for websocket messages (#187)

## 2.4.9

- Use custom CreateStartScripts task to generate start scripts. Refs #137 (#186)

## 2.4.8

- Add localisation support with initial Spanish translations (#184)

## 2.4.7

- Add command debug logging (#178)

## 2.4.6

- Use seperate publish workflow (#177

## 2.4.5

- Add versions to draft release (#176)
- Add release drafter (#175)
- Add logger and simpler activation (#136)
- Fix Kotlinscript language issue (#174)

## 2.4.4

- Use ShellExecution for starting server and improve server start logging (#145)

## 2.4.3

- Reveal the gradle server tasks command to help with debugging issues starting the gradle server (#139)

## 2.4.2

- Fix restarting and reconnecting to server (#117)
- Fix task cancellation state in explorer (#118)

## 2.4.1

- Handle stopping tasks better by showing cancel state in explorer
- Add open settings command to explorer

## 2.4.0

- Run task refresh process in the background (which prevents the editor from waiting for tasks)

## 2.3.1

- Fix stopping Gradle processes via terminal and statusbar

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
