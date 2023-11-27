# Change Log
All notable changes to the "vscode-gradle" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## 3.13.5
### Added
- Implement onWillUpdate() in GradleBuildServerBuildSupport. [PR#1405](https://github.com/microsoft/vscode-gradle/pull/1405)

### Fixed
- Disable manually applying configuration files on import temporarily. [PR#1451](https://github.com/microsoft/vscode-gradle/pull/1451)

### Changed
- Bump Gradle wrapper to v8.4. [#1420](https://github.com/microsoft/vscode-gradle/issues/1420), contributed by [@JoseLion](https://github.com/JoseLion)


## 3.13.4
### Fixed
- Store the scan result of the project importer. [PR#1445](https://github.com/microsoft/vscode-gradle/pull/1445)
- Plugin with id not found. [GBS#98](https://github.com/microsoft/build-server-for-gradle/pull/98)
- No builders are available to build a model of type. [GBS#99](https://github.com/microsoft/build-server-for-gradle/pull/99)
- No such method error: CompileOptions.getAnnotationProcessorGeneratedSourcesDirectory(). [GBS#100](https://github.com/microsoft/build-server-for-gradle/pull/100)

## 3.13.3
### Fixed
- Ignore the generated optional sources during problem checker. [PR#1443](https://github.com/microsoft/vscode-gradle/pull/1443)

## 3.13.2
### Fixed
- Skip Android projects when importing Gradle projects. [PR#1439](https://github.com/microsoft/vscode-gradle/pull/1439)
- Improve the project scan logic. [PR#1432](https://github.com/microsoft/vscode-gradle/pull/1432)
- Reuse built extension for tests in CI pipelines. [PR#1438](https://github.com/microsoft/vscode-gradle/pull/1438), contributed by [@JoseLion](https://github.com/JoseLion)

## 3.13.1
### Fixed
- Improve the project root inference logic. [PR#1433](https://github.com/microsoft/vscode-gradle/pull/1433)
- Add windows requirements into CONTRIBUTING.md. [PR#1429](https://github.com/microsoft/vscode-gradle/pull/1429), contributed by [@JoseLion](https://github.com/JoseLion)
- Reuse Gradle connector for the same project root. [GBS#94](https://github.com/microsoft/build-server-for-gradle/pull/94)
- Improve the Gradle home path search logic. [GBS#95](https://github.com/microsoft/build-server-for-gradle/pull/95)
- Use Gradle 7.4.2 as a fallback version when no suitable build approach is found. [GBS#96](https://github.com/microsoft/build-server-for-gradle/pull/96)

## 3.13.0
### Added
- Add support for subfolder gradle projects. [PR#1336](https://github.com/microsoft/vscode-gradle/pull/1336), contributed by [@gayanper](https://github.com/gayanper)
- Add a new Gradle project importer that leverage the [Gradle Build Server](https://github.com/microsoft/build-server-for-gradle) to import Gradle projects. You can turn it off via setting `java.gradle.buildServer.enabled`, if you don't want to use it.

### Fixed
- Replace link to AdoptOpenJDK with Adoptium in README. [PR#1412](https://github.com/microsoft/vscode-gradle/pull/1412), contributed by [@ElectricalBoy](https://github.com/ElectricalBoy)

## [3.12.7](https://github.com/microsoft/vscode-gradle/compare/3.12.6...3.12.7) (2023-03-29)

### Added
- Support Java 19. [PR#1319](https://github.com/microsoft/vscode-gradle/pull/1319)

### Changed
- Upgrade vscode requirement to `1.76.0`. [PR#1263](https://github.com/microsoft/vscode-gradle/pull/1263)
- Upgrade repository wrapper to `8.0.2`. [PR#1317](https://github.com/microsoft/vscode-gradle/pull/1317)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A%22March+2023%22+is%3Aclosed)

## [3.12.6](https://github.com/microsoft/vscode-gradle/compare/3.12.5...3.12.6) (2022-11-29)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A%22November+2022%22+is%3Aclosed)

## [3.12.5](https://github.com/microsoft/vscode-gradle/compare/3.12.4...3.12.5) (2022-09-28)

### Added
- New configuration `gradle.projectOpenBehaviour` to specify the default method of opening newly created project. [PR#1282](https://github.com/microsoft/vscode-gradle/pull/1282)

## [3.12.4](https://github.com/microsoft/vscode-gradle/compare/3.12.3...3.12.4) (2022-08-31)

### Added
- Automatically rename duplicate task names with additional relative path. [PR#1265](https://github.com/microsoft/vscode-gradle/pull/1265)

### Changed
- Allow to use environment executable java to launch servers. [PR#1263](https://github.com/microsoft/vscode-gradle/pull/1263)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A%22Augest+2022%22+is%3Aclosed)

## [3.12.3](https://github.com/microsoft/vscode-gradle/compare/3.12.2...3.12.3) (2022-07-27)

### Added
- Show Gradle commands in Project Manager's submenu. [PR#1252](https://github.com/microsoft/vscode-gradle/pull/1252)
- Show shortcut for reload all Java projects in Gradle Project view. [PR#1259](https://github.com/microsoft/vscode-gradle/pull/1259)

### Changed
- Move the previous refresh button to overflow group. [PR#1259](https://github.com/microsoft/vscode-gradle/pull/1259)

## [3.12.2](https://github.com/microsoft/vscode-gradle/compare/3.12.1...3.12.2) (2022-06-30)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A%22June+2022%22+is%3Aclosed)

## [3.12.1](https://github.com/microsoft/vscode-gradle/compare/3.12.0...3.12.1) (2022-06-01)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A%22May+2022%22+is%3Aclosed)

## [3.12.0](https://github.com/microsoft/vscode-gradle/compare/3.11.0...3.12.0) (2022-04-27)

### Changed
- Move pinned tasks to standalone section. [#1197](https://github.com/microsoft/vscode-gradle/issues/1197)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A%22April+2022%22+is%3Aclosed)

## [3.11.0](https://github.com/microsoft/vscode-gradle/compare/3.10.0...3.11.0) (2022-03-02)

### Added
- Support `java.jdt.ls.java.home` configuration from redhat.java. [PR#1169](https://github.com/microsoft/vscode-gradle/pull/1169)

### Changed
- Double-click to run tasks in `Gradle Project` view. [PR#1174](https://github.com/microsoft/vscode-gradle/pull/1174)
- Move pinned tasks to `Gradle Project` view and remove `Pinned Tasks` view. [PR#1182](https://github.com/microsoft/vscode-gradle/pull/1182)
- Reorganize requests and TAPI usages to improve performance. [#1088](https://github.com/microsoft/vscode-gradle/issues/1088)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A%22February+2022%22+is%3Aclosed)

## [3.10.0](https://github.com/microsoft/vscode-gradle/compare/3.9.0...3.10.0) (2022-01-26)

### Added
- Support automatically detecting debug tasks. [PR#1149](https://github.com/microsoft/vscode-gradle/pull/1149)
- Support creating new project. [PR#1146](https://github.com/microsoft/vscode-gradle/pull/1146)

### Changed
- Upgrade repository wrapper to `7.3.3`. [PR#1145](https://github.com/microsoft/vscode-gradle/pull/1145)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A%22January+2022%22+is%3Aclosed)

## [3.9.0](https://github.com/microsoft/vscode-gradle/compare/3.8.4...3.9.0) (2021-12-22)
### Added
- Show task selectors. [PR#1121](https://github.com/microsoft/vscode-gradle/pull/1121)
- Support parallel running of tasks. [#1045](https://github.com/microsoft/vscode-gradle/issues/1045)

### Changed
- Improve dependency completion quality. [PR#1090](https://github.com/microsoft/vscode-gradle/pull/1090)
- Hide Gradle commands in non-Gradle workspace. [#1108](https://github.com/microsoft/vscode-gradle/issues/1108)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A%22December+2021%22+is%3Aclosed)

## [3.8.4](https://github.com/microsoft/vscode-gradle/compare/3.8.3...3.8.4) (2021-11-24)
### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A3.8.4+is%3Aclosed)

## [3.8.3](https://github.com/microsoft/vscode-gradle/compare/3.8.2...3.8.3) (2020-11-24)
### Added
- Add refresh button in default project view. [PR#1078](https://github.com/microsoft/vscode-gradle/pull/1078)
- Support VSCode variables in custom task definition. [PR#1035](https://github.com/microsoft/vscode-gradle/pull/1035)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A3.8.3+is%3Aclosed)

## [3.8.2](https://github.com/microsoft/vscode-gradle/compare/3.8.1...3.8.2) (2021-11-05)
### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A3.8.2+is%3Aclosed)

## [3.8.1](https://github.com/microsoft/vscode-gradle/compare/3.8.0...3.8.1) (2021-10-28)
### Added
- Support auto completion for closures from plugins. [#1022](https://github.com/microsoft/vscode-gradle/issues/1022)
- Support managed properties. [PR#1053](https://github.com/microsoft/vscode-gradle/pull/1053)
- Support deprecated tags. [PR#1058](https://github.com/microsoft/vscode-gradle/pull/1058)

### Changed
- Support Gradle projects without wrapper. [#1004](https://github.com/microsoft/vscode-gradle/issues/1004)
- Sort the completion list by the kind. [#1051](https://github.com/microsoft/vscode-gradle/issues/1051)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A3.8.1+is%3Aclosed)

## [3.8.0](https://github.com/microsoft/vscode-gradle/compare/3.7.1...3.8.0) (2021-09-29)
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

## [3.7.1](https://github.com/microsoft/vscode-gradle/compare/3.7.0...3.7.1) (2021-09-23)
### Fixed
- Fix the `Details` and `Changelog` tabs in the marketplace page. [PR#1012](https://github.com/microsoft/vscode-gradle/pull/1012)


## [3.7.0](https://github.com/microsoft/vscode-gradle/compare/3.6.2...3.7.0) (2021-09-22)
### Added
- Support dependency view. [PR#887](https://github.com/microsoft/vscode-gradle/pull/887)
- Support local Gradle installation. [PR#926](https://github.com/microsoft/vscode-gradle/pull/926)

### Changed
- Rename `Gradle Tasks` view to `Gradle Projects` view.
- Hide `STOPPED` daemons in Gradle Daemons view by default. [PR#940](https://github.com/microsoft/vscode-gradle/pull/940)
- Refine UX when there is no item in pinned tasks and recent tasks view. [PR#937](https://github.com/microsoft/vscode-gradle/pull/937)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+label%3Abug+milestone%3A3.7.0+is%3Aclosed)

## [3.6.2](https://github.com/microsoft/vscode-gradle/compare/3.6.1...3.6.2) (2021-09-22)
### Changed
- The publisher is changed from `richardwillis` to `Microsoft`.

The detail changes before `3.6.2` can be found here: https://github.com/microsoft/vscode-gradle/releases
