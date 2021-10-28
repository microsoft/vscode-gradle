# Change Log
All notable changes to the "vscode-gradle" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## 3.8.1
### Added
- Support auto completion for closures from plugins. [#1022](https://github.com/microsoft/vscode-gradle/issues/1022)
- Support managed properties. [PR#1053](https://github.com/microsoft/vscode-gradle/pull/1053)
- Support deprecated tags. [PR#1058](https://github.com/microsoft/vscode-gradle/pull/1058)

### Changed
- Support Gradle projects without wrapper. [#1004](https://github.com/microsoft/vscode-gradle/issues/1004)
- Sort the completion list by the kind. [#1051](https://github.com/microsoft/vscode-gradle/issues/1051)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A3.8.1+is%3Aclosed)

## 3.8.0
### Added
- Support highlighting of Gradle file. [PR#960](https://github.com/microsoft/vscode-gradle/pull/960), [PR#967](https://github.com/microsoft/vscode-gradle/pull/967)
- Provide document outline of Gradle file. [PR#969](https://github.com/microsoft/vscode-gradle/pull/969)
- Show syntax diagnostics of Gradle file. [PR#962](https://github.com/microsoft/vscode-gradle/pull/962)
- Support auto completion for dependencies. [PR#970](https://github.com/microsoft/vscode-gradle/pull/970)
- Support auto completion for basic Gradle closures. [PR#971](https://github.com/microsoft/vscode-gradle/pull/971)
- Support basic projects view. [PR#1002](https://github.com/microsoft/vscode-gradle/pull/1002)

### Changed
- Upgrade vscode requirement to `1.60.0`. [PR#997](https://github.com/microsoft/vscode-gradle/pull/997)
- Adopt the new `folder-library` icon. [PR#997](https://github.com/microsoft/vscode-gradle/pull/997)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A3.8.0+is%3Aclosed)

## 3.7.1
### Fixed
- Fix the `Details` and `Changelog` tabs in the marketplace page. [PR#1012](https://github.com/microsoft/vscode-gradle/pull/1012)


## 3.7.0
### Added
- Support dependency view. [PR#887](https://github.com/microsoft/vscode-gradle/pull/887)
- Support local Gradle installation. [PR#926](https://github.com/microsoft/vscode-gradle/pull/926)

### Changed
- Rename `Gradle Tasks` view to `Gradle Projects` view.
- Hide `STOPPED` daemons in Gradle Daemons view by default. [PR#940](https://github.com/microsoft/vscode-gradle/pull/940)
- Refine UX when there is no item in pinned tasks and recent tasks view. [PR#937](https://github.com/microsoft/vscode-gradle/pull/937)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A3.7.0+is%3Aclosed)

## 3.6.2
### Changed
- The publisher is changed from `richardwillis` to `Microsoft`.

The detail changes before `3.6.2` can be found here: https://github.com/microsoft/vscode-gradle/releases
