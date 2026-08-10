# Java Tooling Duplicate Detection Policy

Apply the built-in IssueLens duplicate evidence thresholds. Search the target
repository and all related Java tooling repositories below for duplicate and
related issues:

- `redhat-developer/vscode-java` — Java language support, navigation,
  completion, refactoring, snippets, and Java project import.
- `microsoft/vscode-java-debug` — Java debugging.
- `microsoft/vscode-java-test` — JUnit and TestNG test running and debugging.
- `microsoft/vscode-maven` — Maven project scaffolding and goals.
- `microsoft/vscode-gradle` — Gradle tasks, dependencies, build-file authoring,
  and extension integration.
- `microsoft/build-server-for-gradle` — Gradle Build Server project import and
  synchronization.

## Scope Rules

- Search open and closed issues in every repository above.
- Select repositories from the affected feature evidence. When ownership is
  ambiguous, search all six repositories.
- Report every repository that could not be searched. Do not claim the full
  Java tooling scope was clear when any configured repository was inaccessible.
- A candidate in another repository may be the canonical issue when its
  component owns the failing behavior and the technical evidence meets the
  built-in threshold.
- Do not label a target issue as `duplicate` for a merely related cross-project
  issue. Require the same error signature, stack signature, or reproduction
  trigger plus the required supporting evidence.

## Component Routing Evidence

- Navigation, completion, refactoring, snippets, Java language diagnostics, or
  Java project model behavior usually belongs to `redhat-developer/vscode-java`.
- Launch, attach, breakpoints, stepping, debug console, or Java debug adapter
  behavior usually belongs to `microsoft/vscode-java-debug`.
- Test discovery, Test Explorer, JUnit, TestNG, or test result behavior usually
  belongs to `microsoft/vscode-java-test`.
- Maven Explorer, archetypes, POM handling, or Maven goal execution usually
  belongs to `microsoft/vscode-maven`.
- Gradle Tasks UI, Gradle dependencies, build-file editing, or extension-side
  Gradle behavior usually belongs to `microsoft/vscode-gradle`.
- BSP connection, Gradle Build Server synchronization, or BSP-based Gradle
  project import usually belongs to `microsoft/build-server-for-gradle`.

Cross-project ownership guidance is supporting evidence only. It does not by
itself establish a duplicate.