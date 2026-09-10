import json
import re
import tempfile
import hashlib
from datetime import datetime, timezone
from pathlib import Path


GROUP_KEYS = (
    "yourChanges",
    "needsYourReview",
    "returnedToYou",
    "approved",
    "waitingForReviewers",
    "drafts",
    "waitingForAuthor",
)

FAILED_CHECK_STATES = {
    "ACTION_REQUIRED",
    "CANCELLED",
    "ERROR",
    "FAILURE",
    "STARTUP_FAILURE",
    "TIMED_OUT",
}

PENDING_CHECK_STATES = {
    "EXPECTED",
    "IN_PROGRESS",
    "PENDING",
    "QUEUED",
    "REQUESTED",
    "WAITING",
}


def build_artifacts(repository, viewer_login, pull_requests, diffs):
    groups = {key: [] for key in GROUP_KEYS}
    details = {}
    parsed_diffs = {}

    for pull_request in pull_requests:
        number = pull_request["number"]
        summary = build_summary(pull_request)
        group = choose_group(pull_request, viewer_login)
        groups[group].append(summary)
        details[number] = build_details(repository, pull_request)
        parsed_diffs[number] = parse_diff(diffs[number], pull_request.get("files", []))

    return groups, details, parsed_diffs


def build_summary(pull_request):
    return {
        "number": pull_request["number"],
        "link": pull_request["url"],
        "title": pull_request["title"],
        "description": summarize_body(pull_request.get("body", "")),
        "shortSummary": "",
    }


def build_details(repository, pull_request):
    review_decision = format_review_decision(pull_request)
    checks = summarize_checks(pull_request.get("statusCheckRollup") or [])
    mergeable = pull_request.get("mergeable") == "MERGEABLE"

    return {
        **build_summary(pull_request),
        "repository": repository,
        "stack": build_stack(pull_request.get("stack")),
        "body": pull_request.get("body", ""),
        "headSha": pull_request.get("headRefOid"),
        "baseSha": pull_request.get("baseRefOid"),
        "syncedAt": datetime.now(timezone.utc).isoformat(),
        "checkRuns": pull_request.get("statusCheckRollup") or [],
        "reviewRequests": pull_request.get("reviewRequests") or [],
        "reviewHistory": pull_request.get("reviews") or [],
        "author": actor_name(pull_request.get("author")),
        "branch": pull_request["headRefName"],
        "baseBranch": pull_request["baseRefName"],
        "status": format_status(review_decision, mergeable, checks),
        "createdAt": pull_request["createdAt"][:10],
        "updatedAt": pull_request["updatedAt"][:10],
        "reviewers": reviewer_names(pull_request),
        "assignees": [actor_name(actor) for actor in pull_request.get("assignees") or []],
        "labels": [label["name"] for label in pull_request.get("labels") or []],
        "milestone": (pull_request.get("milestone") or {}).get("title") or "None",
        "draft": bool(pull_request.get("isDraft")),
        "mergeable": mergeable,
        "mergeability": pull_request.get("mergeable") or "UNKNOWN",
        "reviewDecision": review_decision,
        "reviewDecisionState": pull_request.get("reviewDecision") or "",
        "filesChanged": pull_request.get("changedFiles", 0),
        "additions": pull_request.get("additions", 0),
        "deletions": pull_request.get("deletions", 0),
        "commits": len(pull_request.get("commits") or []),
        "commitHistory": [{"oid": commit["oid"], "messageHeadline": commit.get("messageHeadline", "")} for commit in pull_request.get("commits") or [] if commit.get("oid")],
        "checks": checks,
    }


def build_stack(stack):
    if not stack:
        return None

    return {
        "number": stack["number"],
        "baseBranch": stack["base"]["ref"],
        "entries": [
            {
                "number": entry["number"],
                "title": entry.get("title") or entry["head"]["ref"],
                "branch": entry["head"]["ref"],
                "state": "MERGED" if entry.get("merged_at") else entry["state"].upper(),
                "draft": bool(entry.get("draft")),
            }
            for entry in stack["pull_requests"]
        ],
    }


def choose_group(pull_request, viewer_login):
    author_login = actor_login(pull_request.get("author"))
    decision = pull_request.get("reviewDecision") or ""
    requested_logins = {
        actor_login(actor) for actor in pull_request.get("reviewRequests") or []
    }

    if pull_request.get("isDraft"):
        return "drafts"

    if author_login == viewer_login:
        if decision == "CHANGES_REQUESTED":
            return "returnedToYou"

        if decision == "APPROVED":
            return "approved"

        if requested_logins:
            return "waitingForReviewers"

        return "yourChanges"

    if viewer_login in requested_logins:
        return "needsYourReview"

    if decision == "CHANGES_REQUESTED":
        return "waitingForAuthor"

    if decision == "APPROVED":
        return "approved"

    return "waitingForReviewers"


def parse_diff(patch, file_stats):
    stats_by_path = {item["path"]: item for item in file_stats}
    files = []
    current_file = None
    current_hunk = None

    for line in patch.splitlines():
        if line.startswith("diff --git "):
            if current_file is not None:
                files.append(finalize_file(current_file, stats_by_path))

            old_path, new_path = parse_diff_header(line)
            current_file = {
                "path": new_path,
                "oldPath": old_path,
                "status": "modified",
                "hunks": [],
            }
            current_hunk = None
            continue

        if current_file is None:
            continue

        if line.startswith("new file mode ") or line == "--- /dev/null":
            current_file["status"] = "added"
        elif line.startswith("deleted file mode ") or line == "+++ /dev/null":
            current_file["status"] = "deleted"
        elif line.startswith("rename from "):
            current_file["status"] = "renamed"
        elif line.startswith("rename to "):
            current_file["path"] = line.removeprefix("rename to ")
        elif line.startswith("@@"):
            current_hunk = {"header": line, "lines": []}
            current_file["hunks"].append(current_hunk)
        elif current_hunk is not None and line.startswith((" ", "+", "-", "\\")):
            current_hunk["lines"].append(line)

    if current_file is not None:
        files.append(finalize_file(current_file, stats_by_path))

    return {"files": files}


def parse_diff_header(line):
    match = re.match(r"^diff --git a/(.*) b/(.*)$", line)

    if match is None:
        return "unknown", "unknown"

    return match.group(1), match.group(2)


def finalize_file(file_data, stats_by_path):
    path = file_data["path"]
    stats = stats_by_path.get(path) or stats_by_path.get(file_data["oldPath"]) or {}
    raw_status = stats.get("status") or stats.get("changeType")
    status = normalize_file_status(raw_status, file_data["status"])

    return {
        "path": path,
        "oldPath": file_data["oldPath"],
        "status": status,
        "additions": stats.get("additions", count_diff_lines(file_data["hunks"], "+")),
        "deletions": stats.get("deletions", count_diff_lines(file_data["hunks"], "-")),
        "hunks": file_data["hunks"],
    }


def normalize_file_status(raw_status, inferred_status):
    statuses = {
        "added": "added",
        "changed": "modified",
        "deleted": "deleted",
        "modified": "modified",
        "removed": "deleted",
        "renamed": "renamed",
    }
    return statuses.get(str(raw_status).lower(), inferred_status)


def count_diff_lines(hunks, marker):
    return sum(
        1
        for hunk in hunks
        for line in hunk["lines"]
        if line.startswith(marker)
    )


def summarize_body(body):
    paragraphs = re.split(r"\n\s*\n", body.strip())
    first_paragraph = paragraphs[0] if paragraphs and paragraphs[0] else "No description provided."
    return " ".join(first_paragraph.split())


def actor_login(actor):
    return (actor or {}).get("login") or ""


def actor_name(actor):
    actor = actor or {}
    return actor.get("name") or actor.get("login") or "Unknown"


def reviewer_names(pull_request):
    reviewers = []

    for actor in pull_request.get("reviewRequests") or []:
        name = actor_name(actor)

        if name not in reviewers:
            reviewers.append(name)

    for review in pull_request.get("reviews") or []:
        name = actor_name(review.get("author"))

        if name not in reviewers:
            reviewers.append(name)

    return reviewers


def format_review_decision(pull_request):
    decision = pull_request.get("reviewDecision") or ""

    if decision == "APPROVED":
        return "Approved"

    if decision == "CHANGES_REQUESTED":
        return "Changes requested"

    if pull_request.get("reviews"):
        return "In review"

    return "Awaiting review"


def summarize_checks(checks):
    states = [
        str(check.get("conclusion") or check.get("state") or check.get("status") or "").upper()
        for check in checks
    ]
    failing = sum(state in FAILED_CHECK_STATES for state in states)
    pending = sum(state in PENDING_CHECK_STATES for state in states)

    if failing:
        return f"{failing} check{'s' if failing != 1 else ''} failing"

    if pending:
        return f"{pending} check{'s' if pending != 1 else ''} pending"

    if checks:
        return "All checks passed"

    return "No checks reported"


def format_status(review_decision, mergeable, checks):
    if review_decision == "Approved" and mergeable and checks == "All checks passed":
        return "ready-to-merge"

    if review_decision == "Awaiting review":
        return "needs-review"

    return "in-progress"


def merge_groups(output_directory, repository, groups, details):
    index = Path(output_directory) / "prs.json"
    if not index.exists():
        return groups
    previous = json.loads(index.read_text())
    merged = {key: list(items) for key, items in groups.items()}
    for key, items in previous.items():
        for item in items:
            if item["number"] in details:
                continue
            detail_file = Path(output_directory) / "pr" / str(item["number"]) / "details.json"
            if not detail_file.exists():
                continue
            existing = json.loads(detail_file.read_text())
            if existing.get("repository", "").lower() == repository.lower():
                merged.setdefault(key, []).append(item)
    for items in merged.values():
        items.sort(key=lambda item: item["number"], reverse=True)
    return merged


def write_artifacts(output_directory, groups, details, diffs):
    output_directory = Path(output_directory)

    for number, pull_request_details in details.items():
        repository = pull_request_details.get("repository", "unknown/repository")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) or any(part in (".", "..") for part in repository.split("/")):
            raise ValueError("Invalid repository name")
        for file in [*diffs[number]["files"], *diffs[number].get("comparisonFiles", [])]:
            content = {key: value for key, value in file.items() if key != "fingerprint"}
            file["fingerprint"] = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
        revision = pull_request_details.get("headSha") or hashlib.sha256(json.dumps(diffs[number], sort_keys=True).encode()).hexdigest()
        pull_request_details["revision"] = revision
        write_json(output_directory / "history" / repository / str(number) / f"{revision}.json", {
            "details": pull_request_details, "diff": diffs[number],
        })
        pull_request_directory = output_directory / "pr" / str(number)
        write_json(pull_request_directory / "diff.json", diffs[number])
        write_json(pull_request_directory / "details.json", pull_request_details)

    write_json(output_directory / "prs.json", groups)


def write_json(destination, payload):
    destination.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=destination.parent,
        delete=False,
    ) as temporary_file:
        json.dump(payload, temporary_file, ensure_ascii=False, indent=2)
        temporary_file.write("\n")
        temporary_path = Path(temporary_file.name)

    temporary_path.replace(destination)
