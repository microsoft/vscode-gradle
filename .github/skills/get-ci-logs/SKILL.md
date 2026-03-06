---
name: get-ci-logs
description: 'Retrieve GitHub Actions CI job logs for a pull request. Use when: checking CI output, debugging CI failures, reading test logs, analyzing build errors, fetching workflow run results. Input: PR URL and job name.'
argument-hint: 'PR URL and job name, e.g. https://github.com/owner/repo/pull/123 "Test Java 21 - Node 20 - macos-latest"'
---

# Get CI Logs

Retrieve GitHub Actions workflow run logs for a specific job on a pull request.

## When to Use
- Debug CI test failures by reading job logs
- Check build output for a specific platform/matrix job
- Analyze why a CI step failed
- Review test diagnostic output from a PR's latest run

## Inputs
1. **PR URL** — e.g. `https://github.com/microsoft/vscode-gradle/pull/1772`
2. **Job name** — the display name of the job to fetch logs for, as shown in the workflow YAML or GitHub Actions UI (e.g. `"Test Java 21 - Node 20 - macos-latest"`)

## Procedure

### Step 1: Parse inputs
Extract the PR URL and job name from the user's request. The job name can be a substring match (e.g. "macos-latest" matches "Test Java 21 - Node 20 - macos-latest").

### Step 2: Run the Python script
Execute the `get_ci_logs.py` script located alongside this SKILL.md:

```
python .github/skills/get-ci-logs/get_ci_logs.py "<PR_URL>" "<JOB_NAME>"
```

The script:
1. Parses the PR URL to extract owner/repo/PR number
2. Gets the PR head SHA via GitHub API
3. Finds the latest workflow run for that SHA
4. Lists jobs and matches by name (case-insensitive substring)
5. Prints step summaries and full log output

**Authentication**: The script uses `GITHUB_TOKEN` env var or falls back to `gh auth token` (GitHub CLI). Public repos work without auth.

### Step 3: Present results
- If the job is still queued/in_progress, report that to the user
- If completed, analyze the log output focusing on:
  - Error lines, test failures, assertion errors
  - Any `[diag]` diagnostic lines
  - The failing step's output
- Summarize findings concisely

## Fallback
If the `fetch_webpage` tool cannot retrieve the logs (e.g., auth required for private repos), instruct the user to:
1. Open the GitHub Actions run URL in their browser
2. Click on the specific job
3. Copy/paste the relevant log section

## Notes
- The GitHub Actions logs API is publicly accessible for public repositories
- For private repos, authentication via `GITHUB_TOKEN` may be required
- Job logs can be large; focus on the failing step's output
- The workflow YAML file (`.github/workflows/`) can be read to find valid job names
