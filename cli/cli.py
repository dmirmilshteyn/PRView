import argparse
import sys
from pathlib import Path

from cli.artifacts import build_artifacts, write_artifacts
from cli.github import GitHubClient


def build_parser():
    parser = argparse.ArgumentParser(
        prog="pr",
        description="Manage PRView pull request data.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    sync_parser = subparsers.add_parser(
        "sync",
        help="Sync open pull requests from GitHub",
        description="Sync a GitHub repository's open pull requests into PRView artifacts.",
    )
    sync_parser.add_argument(
        "repository",
        help="GitHub repository in OWNER/REPO form or a GitHub URL",
    )
    sync_parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts"),
        help="Artifact output directory (default: artifacts)",
    )
    sync_parser.add_argument(
        "--limit",
        type=positive_integer,
        default=100,
        help="Maximum open pull requests to fetch (default: 100)",
    )
    sync_parser.set_defaults(handler=sync_repository)
    return parser


def positive_integer(value):
    parsed_value = int(value)

    if parsed_value < 1:
        raise argparse.ArgumentTypeError("must be at least 1")

    return parsed_value


def sync_repository(options):
    try:
        client = GitHubClient()
        repository = client.get_repository_name(options.repository)
        viewer_login = client.get_viewer_login()
        pull_requests = client.list_pull_requests(repository, options.limit)
        diffs = {
            pull_request["number"]: client.get_pull_request_diff(
                repository, pull_request["number"]
            )
            for pull_request in pull_requests
        }
        groups, details, parsed_diffs = build_artifacts(
            repository, viewer_login, pull_requests, diffs
        )
        write_artifacts(options.output, groups, details, parsed_diffs)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"pr: {error}", file=sys.stderr)
        return 1

    print(
        f"Synced {len(pull_requests)} open pull request(s) from {repository} "
        f"to {options.output}."
    )
    return 0


def main():
    options = build_parser().parse_args()
    return options.handler(options)


if __name__ == "__main__":
    raise SystemExit(main())
