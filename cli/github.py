import json
import shutil
import subprocess


class GitHubClient:
    def __init__(self):
        if shutil.which("gh") is None:
            raise RuntimeError("GitHub CLI (gh) is not installed or is not on PATH")

    def get_viewer_login(self):
        return self._run_text(["api", "user", "--jq", ".login"]).strip()

    def get_repository_name(self, repository):
        return self._run_text(
            ["repo", "view", repository, "--json", "nameWithOwner", "--jq", ".nameWithOwner"]
        ).strip()

    def list_pull_requests(self, repository, limit):
        fields = [
            "additions",
            "assignees",
            "author",
            "baseRefName",
            "body",
            "changedFiles",
            "commits",
            "createdAt",
            "deletions",
            "files",
            "headRefName",
            "isDraft",
            "labels",
            "mergeable",
            "milestone",
            "number",
            "reviewDecision",
            "reviewRequests",
            "reviews",
            "statusCheckRollup",
            "title",
            "updatedAt",
            "url",
        ]
        output = self._run_text(
            [
                "pr",
                "list",
                "--repo",
                repository,
                "--state",
                "open",
                "--limit",
                str(limit),
                "--json",
                ",".join(fields),
            ]
        )
        return json.loads(output)

    def get_pull_request_diff(self, repository, number):
        return self._run_text(
            ["pr", "diff", str(number), "--repo", repository, "--color", "never"]
        )

    def _run_text(self, arguments):
        completed = subprocess.run(
            ["gh", *arguments],
            check=False,
            capture_output=True,
            text=True,
        )

        if completed.returncode != 0:
            message = completed.stderr.strip() or completed.stdout.strip() or "unknown error"
            raise RuntimeError(f"gh {' '.join(arguments[:2])} failed: {message}")

        return completed.stdout
