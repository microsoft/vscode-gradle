# Change Log
All notable changes to the "vscode-gradle" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## 3.17.0
## What's Changed
* enhancement - Support onBuildShowMessage for BSP client by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1583
* enhancement - Extract classes.jar from *.aar by @Tanish-Ranjan in https://github.com/microsoft/vscode-gradle/pull/1594
* enhancement - Gradle project view keeps project hierarchy by @jjohannes in https://github.com/microsoft/vscode-gradle/pull/1612
* enhancement - add groupId, artifactId and version attributes by @mamilic in https://github.com/microsoft/vscode-gradle/pull/1620
* enhancement - Add support for profiling Gradle tasks by @ingokegel in https://github.com/microsoft/vscode-gradle/pull/1639
* fix - java generate Random pipe path by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1582
* fix - Gradle test debug not working on version 8.5 and higher by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1586
* fix - Correct the gradle java version to jdt parsing by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1590
* fix - Fallback to /tmp/ when named pipe is too long by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1591
* fix - Add root project folder to each key in projectTreeItemMap by @jjohannes in https://github.com/microsoft/vscode-gradle/pull/1617
* fix - Discover Gradle builds by looking for setting.gradle(.kts) by @jjohannes in https://github.com/microsoft/vscode-gradle/pull/1618
* fix - Cannot see Delegate Test to Gradle option in VS Code by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1622
* fix - Update the problem checker according to the upstream change by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1658
* fix - Add save participant under its own ID to avoid conflicts. by @rgrunber in https://github.com/microsoft/vscode-gradle/pull/1649
* docs - architecture image typo by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1599
* gbs - Parallelize source set retrieval. by @Arthurm1 in https://github.com/microsoft/build-server-for-gradle/pull/168
* gbs - Find compatible GradleJavaHome and notify client in case of incompatibility by @Tanish-Ranjan in https://github.com/microsoft/build-server-for-gradle/pull/165
* gbs - Handle java source/target defined at extension level by @Arthurm1 in https://github.com/microsoft/build-server-for-gradle/pull/188

## New Contributors
* @Tanish-Ranjan made their first contribution in https://github.com/microsoft/vscode-gradle/pull/1594
* @jjohannes made their first contribution in https://github.com/microsoft/vscode-gradle/pull/1612
* @mamilic made their first contribution in https://github.com/microsoft/vscode-gradle/pull/1620
* @domainexpert made their first contribution in https://github.com/microsoft/vscode-gradle/pull/1642
* @rgrunber made their first contribution in https://github.com/microsoft/vscode-gradle/pull/1649
* @ingokegel made their first contribution in https://github.com/microsoft/vscode-gradle/pull/1639

**Full Changelog**: https://github.com/microsoft/vscode-gradle/compare/3.16.4...3.17.0

## 3.16.4
## What's Changed
* fix - closeConnection will fail if pipe server hasn't been started by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1579
* build - Update Gradle task to v3 by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1580
* build - Compilation error in test code by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1571

## 3.16.3
## What's Changed
* enhancement - Activate the extension when gradle files are in sub-folders of the workspace by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1570
* enhancement - Notify user to install jdk when GradleServerEnv not found by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1569
* fix - Language server generatePipepath error by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1557
* fix - Add bspProxy connectors error listeners by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1558
* fix - Fallback to BuildShip when importer connect hit max attempts  by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1560
* fix - Improve bspProxy start sequence by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1563
* fix - Deduplicate the project dependency by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1568
* fix - Refine waitForImporterPipePath event & listener sequence by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1573
* fix - Fallback to Buildship when multiple gradle projects in same level by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1574
* fix - Create linked folder for resource if it's placed out of the project by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1575
* fix - Fallback to Buildship when failed to generate named pipe by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1576
* docs - Refine doc & Remove redundant file by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1561
* docs - Add comments for taskServerClient handleConnectError by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1565
* build - Bump @grpc/grpc-js from 1.8.14 to 1.8.22 in /extension by @dependabot in https://github.com/microsoft/vscode-gradle/pull/1494
* build - Bump node version to 18.20.4 by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1567

## 3.16.2
### What's Changed
* fix - Stop start build server when getRandomPipepath return empty by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1545
* fix - Use 'java.import.gradle.java.home' when it's specified by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1552
* fix - Inform that JDK 17 is required by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1549
* fix - Refine findValidJavaHome logic by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1554

## 3.16.1
## What's Changed
* enhancement - Support debug test delegation by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1536
* fix - Gradle build server cannot be started when path has spaces by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1542
* fix - Fail to start if import.gradle.java.home jdk version lower than 17 by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1547

## 3.16.0
## What's Changed
* performance - Merge Task Server & Build Server by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1512
* performance - Merge Language Server to Gradle Server by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1525
* fix - Catch the error when running Gradle tests by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1524
* fix - Wrong status code returned for test completion by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1532
* fix - Override LanguageServer setTrace to avoid default Exception throw by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1533
* fix - Get daemon status handle project folder name include empty space by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1537
* documentation - Update architecture.md for merge server by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1520
* documentation - Update doc after merge language server by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1528

### 3.15.0
## What's Changed
* feat - Support delegate tests to Gradle build Server by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1510
* fix - Only send request after initialization by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1503
* fix - Add java 22 to compatibility matrix by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1505
* refactor - Introduce gson to simplify the object parsing by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1509
* fix - Slice the build target list to 1 when running gradle tests by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1518

### 3.14.1
### What's Changed
* fix - Fix the importer version.

## 3.14.0
### What's Changed
* enhancement - Bump Gradle Wrapper to v8.5 and change Java 21 min Gradle version by @JoseLion in https://github.com/microsoft/vscode-gradle/pull/1455
* enhancement - Group the Gradle related menus in the file explorer into a submenu labeled 'Gradle' by @testforstephen in https://github.com/microsoft/vscode-gradle/pull/1474
* enhancement - Upgrade Build Server for Gradle to 0.2.0
* fix - Exclude the project itself becoming its project classpath entry by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1464
* fix - Append the log message to build output if it's from compilation report. by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1490
* fix - Set GradleExecution jdk use java.import.gradle.java.home by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1491
* fix - Refresh the output folders after build tasks by @jdneo in https://github.com/microsoft/vscode-gradle/pull/1493
* build - Fix buildJars task by @donat in https://github.com/microsoft/vscode-gradle/pull/1481
* build - Add Build Server debug config by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1486
* build - Move Gradle Daemons implementation from Java into Typescript by @Jiaaming in https://github.com/microsoft/vscode-gradle/pull/1489

## New Contributors
* @donat made their first contribution in https://github.com/microsoft/vscode-gradle/pull/1481
* @Jiaaming made their first contribution in https://github.com/microsoft/vscode-gradle/pull/1486

**Full Changelog**: https://github.com/microsoft/vscode-gradle/compare/3.13.5...3.14.0

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
