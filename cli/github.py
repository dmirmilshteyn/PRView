import json
import base64
from urllib.parse import quote
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

    def get_pull_request(self, repository, number):
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
            "headRefOid",
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
        return json.loads(self._run_text([
            "pr", "view", str(number), "--repo", repository,
            "--json", ",".join(fields),
        ]))

    def list_pull_requests(self, repository, limit):
        if limit is None:
            numbers = self.get_pages(f"repos/{repository}/pulls?state=open&per_page=100")
            return [self.get_pull_request(repository, item["number"]) for item in numbers]
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
                "number",
            ]
        )
        # Loading commits/reviews for a whole page multiplies GraphQL's
        # possible-node count beyond its limit, even for small repositories.
        return [self.get_pull_request(repository, item["number"]) for item in json.loads(output)]

    def get_pull_request_diff(self, repository, number):
        return self._run_text(
            ["pr", "diff", str(number), "--repo", repository, "--color", "never"]
        )

    def get_pages(self, endpoint):
        pages = self.decode_pages(self._run_text(["api", "--paginate", endpoint]))
        return [item for page in pages for item in page]

    def decode_pages(self, output):
        # gh 2.46 (Debian) emits consecutive JSON documents with --paginate.
        decoder = json.JSONDecoder()
        pages = []
        remaining = output.lstrip()
        while remaining:
            page, end = decoder.raw_decode(remaining)
            pages.append(page)
            remaining = remaining[end:].lstrip()
        return pages

    def get_context(self, repository, number):
        # All API operations in this client are reads. Never create GitHub reviews.
        comments = self.get_pages(f"repos/{repository}/issues/{number}/comments?per_page=100")
        reviews = self.get_pages(f"repos/{repository}/pulls/{number}/reviews?per_page=100")
        inline = self.get_pages(f"repos/{repository}/pulls/{number}/comments?per_page=100")
        owner, name = repository.split("/")
        query = """query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              reviewThreads(first: 100, after: $endCursor) {
                pageInfo { hasNextPage endCursor }
                nodes { id isResolved isOutdated comments(first: 1) { nodes { databaseId } } }
              }
            }
          }
        }"""
        pages = self.decode_pages(self._run_text([
            "api", "graphql", "--paginate", "-f", f"query={query}",
            "-f", f"owner={owner}", "-f", f"name={name}", "-F", f"number={number}",
        ]))
        threads = []
        for page in pages:
            if page.get("errors"):
                raise RuntimeError(f"Could not read review threads: {page['errors']}")
            threads.extend(page["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"])
        return {"comments": comments, "reviews": reviews, "inlineComments": inline, "threads": threads}

    def get_file(self, repository, file_path, revision):
        endpoint = f"repos/{repository}/contents/{quote(file_path, safe='/')}?ref={quote(revision, safe='')}"
        try:
            result = json.loads(self._run_text(["api", endpoint]))
            if not isinstance(result, dict) or result.get("encoding") != "base64":
                return {"text": None, "error": "Full content unavailable (large file or non-file entry)."}
            raw = base64.b64decode(result.get("content", ""))
            if b"\x00" in raw:
                return {"text": None, "error": "Binary file; text context unavailable."}
            return {"text": raw.decode("utf-8"), "error": None}
        except (RuntimeError, UnicodeDecodeError, ValueError) as error:
            return {"text": None, "error": str(error), "missing": "HTTP 404" in str(error)}

    def get_files(self, repository, number):
        return self.get_pages(f"repos/{repository}/pulls/{number}/files?per_page=100")

    def get_merge_base(self, repository, base, head):
        result = json.loads(self._run_text(["api", f"repos/{repository}/compare/{base}...{head}"]))
        return result["merge_base_commit"]["sha"]

    def verify_revision(self, repository, number, head, base):
        result = self.get_refs(repository, number)
        if result["head"] != head or result["base"] != base:
            raise RuntimeError(f"PR #{number} changed during sync; run sync again to obtain a consistent snapshot.")

    def get_refs(self, repository, number):
        result = json.loads(self._run_text(["api", f"repos/{repository}/pulls/{number}"]))
        return {
            "head": result["head"]["sha"], "base": result["base"]["sha"],
            "stack": result.get("stack"),
        }

    def get_stack(self, repository, number):
        return json.loads(self._run_text(["api", f"repos/{repository}/stacks/{number}"]))

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
