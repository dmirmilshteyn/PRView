import argparse
import sys
import json
from pathlib import Path

from cli.artifacts import build_artifacts, merge_groups, write_artifacts
from cli.github import GitHubClient


def build_parser():
    parser = argparse.ArgumentParser(
        prog="pr",
        description="Manage PRView pull request data.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    sync_parser = subparsers.add_parser(
        "sync",
        help="Sync a PR and its native stack, or all open PRs",
        description="Sync a PR and its native stack, or all open PRs with --all, into PRView artifacts.",
    )
    sync_parser.add_argument(
        "repository",
        help="GitHub repository in OWNER/REPO form or a GitHub URL",
    )
    selection = sync_parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("number", nargs="?", type=positive_integer, help="PR number (includes its entire native GitHub stack)")
    selection.add_argument("--all", action="store_true", help="Sync all open PRs and their native stacks")
    sync_parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts"),
        help="Artifact output directory (default: artifacts)",
    )
    sync_parser.add_argument(
        "--limit",
        type=positive_integer,
        default=None,
        help="Optional maximum open PRs to select with --all (stack members are never limited)",
    )
    sync_parser.set_defaults(handler=sync_repository)
    return parser


def positive_integer(value):
    parsed_value = int(value)

    if parsed_value < 1:
        raise argparse.ArgumentTypeError("must be at least 1")

    return parsed_value


def select_pull_requests(client, repository, number, limit):
    pull_requests = ([client.get_pull_request(repository, number)] if number is not None else
                     client.list_pull_requests(repository, limit))
    seen = {item["number"] for item in pull_requests}
    stacks = {}
    # Appending native members to the queue includes closed/merged PRs and
    # avoids guessing stack membership from branch names or descriptions.
    for pull_request in pull_requests:
        refs = client.get_refs(repository, pull_request["number"])
        if refs["head"] != pull_request["headRefOid"]:
            raise RuntimeError(f"PR #{pull_request['number']} changed during sync; please retry.")
        pull_request["baseRefOid"] = refs["base"]
        membership = refs.get("stack")
        if membership:
            stack_number = membership["number"]
            if stack_number not in stacks:
                stacks[stack_number] = client.get_stack(repository, stack_number)
            stack = stacks[stack_number]
            pull_request["stack"] = stack
            for member in stack["pull_requests"]:
                if member["number"] not in seen:
                    seen.add(member["number"])
                    member_pr = client.get_pull_request(repository, member["number"])
                    member_pr["stack"] = stack
                    pull_requests.append(member_pr)
    return pull_requests


def sync_repository(options):
    try:
        if options.number is not None and options.limit is not None:
            raise ValueError("--limit can only be used with --all")
        client = GitHubClient()
        repository = client.get_repository_name(options.repository)
        viewer_login = client.get_viewer_login()
        pull_requests = select_pull_requests(client, repository, options.number, options.limit)
        diffs = {
            pull_request["number"]: client.get_pull_request_diff(
                repository, pull_request["number"]
            )
            for pull_request in pull_requests
        }
        groups, details, parsed_diffs = build_artifacts(
            repository, viewer_login, pull_requests, diffs
        )
        for pull_request in pull_requests:
            number = pull_request["number"]
            merge_base = client.get_merge_base(repository, pull_request["baseRefOid"], pull_request["headRefOid"])
            details[number]["diffBaseSha"] = merge_base
            details[number]["github"] = client.get_context(repository, number)
            file_metadata = {file["filename"]: file for file in client.get_files(repository, number)}
            for file in parsed_diffs[number]["files"]:
                metadata = file_metadata.get(file["path"], {})
                file["oldPath"] = metadata.get("previous_filename", file.get("oldPath", file["path"]))
                file["baseContent"] = ({"text": "", "error": None} if file["status"] == "added" else
                    client.get_file(repository, file["oldPath"], merge_base))
                file["headContent"] = ({"text": "", "error": None} if file["status"] == "deleted" else
                    client.get_file(repository, file["path"], pull_request["headRefOid"]))
            # Retain content for paths that were changed in earlier snapshots,
            # including changes reverted by the author since the last review.
            historic_paths = set()
            comparison_bases = {}
            for snapshot_file in (options.output / "history" / repository / str(number)).glob("*.json"):
                snapshot = json.loads(snapshot_file.read_text())
                historic_paths.update(file["path"] for file in snapshot["diff"]["files"])
                known = {file["path"] for file in snapshot["diff"]["files"]}
                previous_head = snapshot["details"].get("headSha")
                if previous_head:
                    extra = {}
                    for file in parsed_diffs[number]["files"]:
                        if file["path"] not in known and file.get("oldPath") not in known:
                            content = client.get_file(repository, file["path"], previous_head)
                            extra[file["path"]] = {"text": "", "error": None} if content.get("missing") else content
                    comparison_bases[snapshot["details"]["revision"]] = extra
            current_paths = {file["path"] for file in parsed_diffs[number]["files"]}
            comparison_files = []
            for file_path in sorted(historic_paths - current_paths):
                content = client.get_file(repository, file_path, pull_request["headRefOid"])
                if content.get("missing"):
                    content = {"text": "", "error": None}
                comparison_files.append({"path": file_path, "headContent": content, "hunks": [], "status": "modified"})
            parsed_diffs[number]["comparisonFiles"] = comparison_files
            parsed_diffs[number]["comparisonBases"] = comparison_bases
            client.verify_revision(repository, number, pull_request["headRefOid"], pull_request["baseRefOid"])
        if not options.all:
            groups = merge_groups(options.output, repository, groups, details)
        write_artifacts(options.output, groups, details, parsed_diffs)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"pr: {error}", file=sys.stderr)
        return 1

    print(
        f"Synced {len(pull_requests)} pull request(s) from {repository} "
        f"to {options.output}."
    )
    return 0


def main():
    options = build_parser().parse_args()
    return options.handler(options)


if __name__ == "__main__":
    raise SystemExit(main())
