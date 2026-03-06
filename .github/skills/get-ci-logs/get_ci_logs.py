#!/usr/bin/env python3
"""Fetch GitHub Actions CI job logs for a pull request.

Usage:
    python get_ci_logs.py <pr_url> <job_name_substring>

Examples:
    python get_ci_logs.py https://github.com/microsoft/vscode-gradle/pull/1772 "macos-latest"
    python get_ci_logs.py https://github.com/microsoft/vscode-gradle/pull/1772 "Test Java 21 - Node 20 - macos-latest"

Environment:
    GITHUB_TOKEN  - Optional. Required for private repos. Uses gh CLI token as fallback.

Output:
    Prints job metadata and log content to stdout.
"""

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request


def get_github_token() -> str | None:
    """Get GitHub token from env or gh CLI."""
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    try:
        result = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Capture redirect URL instead of following it."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise _RedirectCaptured(newurl)

class _RedirectCaptured(Exception):
    def __init__(self, url: str):
        self.url = url


def api_get(url: str, token: str | None, accept: str = "application/vnd.github+json",
            follow_redirect_raw: bool = False) -> str:
    """Make a GET request to the GitHub API.

    If follow_redirect_raw=True, follow redirects without sending auth headers
    (needed for log downloads that redirect to Azure Blob Storage).
    """
    req = urllib.request.Request(url)
    req.add_header("Accept", accept)
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        if follow_redirect_raw:
            opener = urllib.request.build_opener(_NoRedirect)
            try:
                with opener.open(req, timeout=30) as resp:
                    return resp.read().decode("utf-8")
            except _RedirectCaptured as rc:
                # Follow redirect without auth headers
                req2 = urllib.request.Request(rc.url)
                with urllib.request.urlopen(req2, timeout=60) as resp:
                    return resp.read().decode("utf-8")
        else:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code} from {url}: {body[:500]}", file=sys.stderr)
        sys.exit(1)


def api_json(url: str, token: str | None) -> dict:
    """GET JSON from GitHub API."""
    return json.loads(api_get(url, token))


def parse_pr_url(url: str) -> tuple[str, str, int]:
    """Extract owner, repo, pull_number from a PR URL."""
    m = re.match(r"https://github\.com/([^/]+)/([^/]+)/pull/(\d+)", url)
    if not m:
        print(f"Invalid PR URL: {url}", file=sys.stderr)
        sys.exit(1)
    return m.group(1), m.group(2), int(m.group(3))


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <pr_url> <job_name_substring>", file=sys.stderr)
        sys.exit(1)

    pr_url = sys.argv[1]
    job_filter = sys.argv[2].lower()
    token = get_github_token()

    owner, repo, pr_number = parse_pr_url(pr_url)
    api_base = f"https://api.github.com/repos/{owner}/{repo}"

    # 1. Get PR head SHA
    pr_data = api_json(f"{api_base}/pulls/{pr_number}", token)
    head_sha = pr_data["head"]["sha"]
    print(f"PR #{pr_number} head SHA: {head_sha[:12]}")

    # 2. Find workflow run for this SHA
    runs_data = api_json(f"{api_base}/actions/runs?head_sha={head_sha}&per_page=5", token)
    if not runs_data["workflow_runs"]:
        print("No workflow runs found for this commit.")
        sys.exit(0)

    run = runs_data["workflow_runs"][0]
    run_id = run["id"]
    print(f"Run: {run['name']} #{run['run_number']} — status={run['status']}, conclusion={run['conclusion']}")
    print(f"URL: {run['html_url']}")

    # 3. List jobs
    jobs_data = api_json(f"{api_base}/actions/runs/{run_id}/jobs?per_page=50", token)
    jobs = jobs_data["jobs"]

    # Find matching job
    matched = [j for j in jobs if job_filter in j["name"].lower()]
    if not matched:
        print(f"\nNo job matching '{job_filter}'. Available jobs:")
        for j in jobs:
            print(f"  - {j['name']} (status={j['status']}, conclusion={j['conclusion']})")
        sys.exit(1)

    job = matched[0]
    job_id = job["id"]
    print(f"\nJob: {job['name']}")
    print(f"  Status: {job['status']}, Conclusion: {job['conclusion']}")
    print(f"  URL: {job['html_url']}")

    # Print step summaries
    if job.get("steps"):
        print(f"\n  Steps:")
        for step in job["steps"]:
            icon = {"success": "✓", "failure": "✗", "skipped": "○", "cancelled": "⊘"}.get(
                step.get("conclusion", ""), "…"
            )
            print(f"    {icon} {step['name']} ({step.get('conclusion', step.get('status', '?'))})")

    if job["status"] not in ("completed",):
        print(f"\nJob is still {job['status']}. Logs not yet available.")
        sys.exit(0)

    # 4. Fetch logs (redirect to Azure Blob Storage — strip auth header)
    print("\n--- LOG OUTPUT ---\n")
    log_text = api_get(f"{api_base}/actions/jobs/{job_id}/logs", token, follow_redirect_raw=True)
    print(log_text)


if __name__ == "__main__":
    main()
