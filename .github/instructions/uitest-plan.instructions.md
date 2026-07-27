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

- Open the Gradle side bar with
  `executeVSCodeCommand workbench.view.extension.gradleContainerView`.
- Prefer stable command IDs such as `gradle.refresh`, `gradle.explorerFlat`,
  and `gradle.explorerTree` over localized Command Palette labels.
- The task tree normally contains the project, a `Tasks` node, optional task
  groups, and task rows. Expand each parent explicitly before clicking a task.
- Use `click <task> tree item exact` to exercise a task through the visible UI.
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
