# UI/E2E tests

This directory contains deterministic VS Code UI scenarios executed by
[`@vscjava/vscode-autotest`](https://github.com/wenytang-ms/javaext-autotest).
The runner opens an isolated VS Code instance, installs the branch-built Gradle
for Java VSIX, drives the Workbench, and records `results.json` plus screenshots.

- Plans: `test/e2e-plans/`
- Agent-writable fixtures: `test/e2e-fixtures/`
- CI: `.github/workflows/e2eUI.yml`
- Authoring rules: `.github/instructions/uitest-plan.instructions.md`

## Requesting a plan through the agent

After this onboarding change is on the default branch and
`microsoft/vscode-gradle` is enabled in the service allowlist:

1. Create an issue that describes the user scenario, fixture, and observable
   expected result.
2. Apply the `agent:test-plan` label.
3. The agent creates or updates only files under `test/e2e-plans/` and
   `test/e2e-fixtures/`, dispatches this workflow for the changed plans, and
   opens a Draft PR only after deterministic Linux and Windows evidence passes.

The repository must contain the `agent:test-plan` label before this flow can be
used.

Validate and run one plan from the repository root:

```powershell
npx -y @vscjava/vscode-autotest validate test\e2e-plans\gradle-task-discovery.yaml
npx -y @vscjava/vscode-autotest run test\e2e-plans\gradle-task-discovery.yaml `
  --vsix .\vscode-gradle.vsix `
  --no-llm `
  --output test-results\gradle-task-discovery
```
