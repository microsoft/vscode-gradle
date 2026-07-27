---
applyTo: "test/e2e-plans/**/*.{yaml,yml}"
description: "Authoring rules for deterministic Gradle for Java UI/E2E plans"
---

# AutoTest UI/E2E plan instructions

Plans under `test/e2e-plans/` are executable YAML scenarios for
`@vscjava/vscode-autotest`. They launch an isolated VS Code instance, install
the current Gradle for Java VSIX, drive the Workbench through Playwright, and
write deterministic `results.json` plus screenshots.

## Setup

- Use `setup.extension: "vscjava.vscode-gradle"` and
  `setup.vscodeVersion: "stable"`.
- CI installs the branch-built `vscode-gradle.vsix` with `--vsix`; never rely on
  the Marketplace extension as the implementation under test.
- Reuse `../../extension/test-fixtures/gradle-groovy-default-build-file` for
  basic task-tree scenarios. Add scenario-specific writable fixtures only
  under `test/e2e-fixtures/`.
- Keep `workbench.startupEditor: "none"` and `gradle.reuseTerminals: "off"`
  unless the scenario explicitly covers those settings.

## Actions

- Open the Gradle side bar with `click side tab Gradle`; this waits for the
  contributed activity tab instead of racing command registration at startup.
- Prefer stable command IDs such as `gradle.refresh`, `gradle.explorerFlat`,
  and `gradle.explorerTree` over localized Command Palette labels.
- Prefer `verifyOutputChannel` on `Gradle for Java` when the assertion is task
  discovery itself. The extension swaps two providers with the same
  `Gradle Projects` title during startup, so output evidence avoids binding a
  discovery check to a transient provider.
- Run tasks from the visible Gradle Projects tree after discovery completes.
  Expand every parent explicitly, then double-click the exact task row. Do not
  use `gradle.runTasks`: it is hidden from the Command Palette and its URI-based
  filtering depends on Java Project menu context that standalone fixtures do
  not provide reliably.
- Use `doubleClick <task> tree item` to exercise a task through the visible UI;
  AutoTest prefers an exact visible label before falling back to fuzzy matching.
- Do not use `waitForLanguageServer` as proof that Gradle task discovery
  completed. The Gradle task server is separate from the Java language server.
  Let `verifyTreeItem` poll for the expected task instead.

## Verification

- Every plan must contain at least one deterministic verifier.
- Use `verifyTreeItem` with `inView: "Gradle Projects"` for task-tree state.
- Use `verifyTerminal` for Gradle task output and `verifyOutputChannel` for
  extension logs.
- Natural-language `verify` text is diagnostic context only. CI runs with
  `--no-llm`, so it cannot determine pass or fail.
- Prefer polling verifiers over fixed waits. A short wait is acceptable only
  after opening a view or changing its layout.

## Local commands

```powershell
npx -y @vscjava/vscode-autotest validate test\e2e-plans\<plan>.yaml
npx -y @vscjava/vscode-autotest run test\e2e-plans\<plan>.yaml `
  --vsix .\vscode-gradle.vsix `
  --no-llm `
  --output test-results\<plan>
```

Build `vscode-gradle.vsix` first by following `CONTRIBUTING.md`. Inspect both
`test-results/<plan>/results.json` and the screenshots before treating a plan
as valid coverage.
