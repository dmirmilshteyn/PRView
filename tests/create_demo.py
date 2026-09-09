"""Create two deterministic, local-only PR snapshots for manual browser verification."""
import argparse
import difflib
import json
from pathlib import Path

from cli.artifacts import build_artifacts, write_artifacts


def create_demo(output):
    number = 900001
    repository = "prview/local-demo"
    original = "\n".join(f"export function step{index}() {{ return {index}; }}" for index in range(1, 61)) + "\n"
    common = {
        "number": number, "url": "https://github.com/prview/local-demo/pull/900001",
        "title": "Local review verification fixture", "body": "# Review context\n\nThis description has multiple paragraphs.\n\n## Test plan\n\n- [x] Unit tests\n- [ ] Review edge cases\n\n```js\nstep30();\n```\n\n| Area | Result |\n| --- | --- |\n| Persistence | Verified locally |",
        "author": {"login": "demo-author"}, "headRefName": "demo", "baseRefName": "main",
        "baseRefOid": "c" * 40, "createdAt": "2026-09-08T00:00:00Z", "updatedAt": "2026-09-09T00:00:00Z",
        "reviewRequests": [{"login": "demo-reviewer"}], "reviews": [{"author": {"login": "demo-reviewer"}, "state": "CHANGES_REQUESTED", "body": "Please check the edge case."}],
        "assignees": [], "labels": [{"name": "local-fixture"}], "reviewDecision": "CHANGES_REQUESTED", "mergeable": "MERGEABLE",
        "changedFiles": 3, "additions": 3, "deletions": 3, "commits": [{"oid": "a" * 40}],
        "statusCheckRollup": [{"name": "Unit tests", "status": "COMPLETED", "conclusion": "SUCCESS", "detailsUrl": "https://github.com/prview/local-demo/actions"}, {"name": "Integration tests", "status": "IN_PROGRESS", "conclusion": ""}],
    }
    for letter in ["a", "b"]:
        contents = {
            "src/steps.js": (original, original.replace("return 30;", "return 300;" if letter == "a" else "return 301;")),
            "src/format.js": ("export function format() {\n  return 'ok';\n}\n", "export function format() {\n    return 'ok';  \n}\n"),
            "src/stable.js": ("export function stable() { return false; }\n", "export function stable() { return true; }\n"),
        }
        patch = ""
        for file_path, (before, after) in contents.items():
            patch += f"diff --git a/{file_path} b/{file_path}\n" + "".join(difflib.unified_diff(before.splitlines(True), after.splitlines(True), fromfile=f"a/{file_path}", tofile=f"b/{file_path}"))
        pr = {**common, "headRefOid": letter * 40, "files": [{"path": file_path} for file_path in contents]}
        groups, details, diffs = build_artifacts(repository, "demo-reviewer", [pr], {number: patch})
        details[number]["syncedAt"] = f"2026-09-0{8 if letter == 'a' else 9}T00:00:00Z"
        details[number]["github"] = {
            "comments": [{"id": 1, "user": {"login": "demo-author"}, "body": "Please focus on **step30**.", "created_at": "2026-09-08T00:00:00Z", "html_url": common["url"]}],
            "reviews": [{"id": 2, "user": {"login": "demo-reviewer"}, "state": "CHANGES_REQUESTED", "body": "Please check the edge case."}],
            "inlineComments": [{"id": 3, "path": "src/steps.js", "line": 30, "original_line": 30, "body": "What happens at the boundary?", "user": {"login": "demo-reviewer"}, "html_url": common["url"]}, {"id": 4, "in_reply_to_id": 3, "body": "Added a test.", "user": {"login": "demo-author"}}],
            "threads": [{"id": "thread-1", "isResolved": False, "isOutdated": False, "comments": {"nodes": [{"databaseId": 3}]}}],
        }
        for file in diffs[number]["files"]:
            before, after = contents[file["path"]]
            file["baseContent"] = {"text": before, "error": None}
            file["headContent"] = {"text": after, "error": None}
        if (output / "prs.json").exists():
            existing = json.loads((output / "prs.json").read_text())
            for key in existing:
                groups.setdefault(key, []).extend(item for item in existing[key] if item["number"] != number)
        write_artifacts(output, groups, details, diffs)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    create_demo(parser.parse_args().output)
