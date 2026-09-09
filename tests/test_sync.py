import base64
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cli.artifacts import build_artifacts, build_stack, merge_groups, write_artifacts
from cli.github import GitHubClient
from cli.cli import build_parser, select_pull_requests, sync_repository
from test_artifacts import pull_request


class SyncTests(unittest.TestCase):

    @patch("cli.cli.GitHubClient")
    def test_target_sync_expands_native_stack_without_listing_repository(self, client_type):
        client = client_type.return_value
        client.get_pull_request.side_effect = lambda repo, number: pull_request(number=number, headRefOid="head")
        client.get_refs.return_value = {"head": "head", "base": "base", "stack": {"number": 26}}
        client.get_stack.return_value = {"number": 26, "base": {"ref": "main"}, "pull_requests": [
            {"number": 21, "state": "closed", "merged_at": "2026-09-01"},
            {"number": 22, "state": "open"}, {"number": 23, "state": "open"},
        ]}
        selected = select_pull_requests(client, "owner/repo", 22, None)
        self.assertEqual([22, 21, 23], [item["number"] for item in selected])
        self.assertTrue(all(item["stack"]["number"] == 26 for item in selected))
        client.list_pull_requests.assert_not_called()
        client.get_stack.assert_called_once_with("owner/repo", 26)
        self.assertEqual(3, client.get_pull_request.call_count)

    @patch("cli.cli.GitHubClient")
    def test_target_without_native_metadata_stays_single(self, client_type):
        client = client_type.return_value
        client.get_pull_request.return_value = pull_request(number=23, headRefOid="head", body="Stack layer 3; depends on #22", baseRefName="feature-22")
        client.get_refs.return_value = {"head": "head", "base": "base", "stack": None}
        selected = select_pull_requests(client, "owner/repo", 23, None)
        self.assertEqual([23], [item["number"] for item in selected])
        client.get_stack.assert_not_called()
        client.list_pull_requests.assert_not_called()

    @patch("cli.cli.GitHubClient")
    def test_all_deduplicates_shared_stacks_and_limit_does_not_truncate_members(self, client_type):
        client = client_type.return_value
        client.list_pull_requests.return_value = [pull_request(number=22, headRefOid="head"), pull_request(number=23, headRefOid="head")]
        client.get_pull_request.side_effect = lambda repo, number: pull_request(number=number, headRefOid="head")
        client.get_refs.side_effect = lambda repo, number: {"head": "head", "base": "base", "stack": None if number == 21 else {"number": 26}}
        client.get_stack.return_value = {"number": 26, "pull_requests": [{"number": 21}, {"number": 22}, {"number": 23}]}
        selected = select_pull_requests(client, "owner/repo", None, 2)
        self.assertEqual([22, 23, 21], [item["number"] for item in selected])
        self.assertTrue(all(item["stack"]["number"] == 26 for item in selected))
        client.get_stack.assert_called_once_with("owner/repo", 26)
        client.list_pull_requests.assert_called_once_with("owner/repo", 2)
        client.get_pull_request.assert_called_once_with("owner/repo", 21)

    @patch("cli.cli.GitHubClient")
    def test_failed_target_sync_leaves_existing_index_untouched(self, client_type):
        client = client_type.return_value
        client.get_repository_name.return_value = "owner/repo"
        client.get_pull_request.return_value = pull_request(number=23, headRefOid="old")
        client.get_refs.return_value = {"head": "new", "base": "base"}
        with tempfile.TemporaryDirectory() as directory:
            index = Path(directory) / "prs.json"
            index.write_text('{"yourChanges": []}\n')
            before = index.read_bytes()
            options = build_parser().parse_args(["sync", "owner/repo", "23", "--output", directory])
            self.assertEqual(1, sync_repository(options))
            self.assertEqual(before, index.read_bytes())
            self.assertFalse((Path(directory) / "pr").exists())

    @patch("cli.github.shutil.which", return_value="gh")
    def test_all_paginates_without_a_default_limit(self, unused):
        client = GitHubClient()
        calls = []
        def run(arguments):
            calls.append(arguments)
            if arguments[0] == "api":
                return '[{"number": 1}]\n[{"number": 2}]'
            return json.dumps({"number": int(arguments[2])})
        client._run_text = run
        self.assertEqual([1, 2], [item["number"] for item in client.list_pull_requests("owner/repo", None)])
        self.assertEqual(["api", "--paginate", "repos/owner/repo/pulls?state=open&per_page=100"], calls[0])

    def test_target_sync_preserves_other_prs_and_replaces_updated_group(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            prs = [pull_request(number=41), pull_request(number=42)]
            groups, details, diffs = build_artifacts("owner/repo", "reviewer", prs, {41: "", 42: ""})
            write_artifacts(output, groups, details, diffs)
            untouched = (output / "pr/41/details.json").read_bytes()
            groups, details, diffs = build_artifacts("owner/repo", "reviewer", [pull_request(number=42, isDraft=True)], {42: ""})
            merged = merge_groups(output, "owner/repo", groups, details)
            write_artifacts(output, merged, details, diffs)
            self.assertEqual([41], [item["number"] for item in merged["needsYourReview"]])
            self.assertEqual([42], [item["number"] for item in merged["drafts"]])
            self.assertEqual(untouched, (output / "pr/41/details.json").read_bytes())
            self.assertEqual(groups, merge_groups(output, "other/repo", groups, details))

    def test_native_stack_preserves_bottom_first_order_and_merged_states(self):
        native = {"number": 26, "base": {"ref": "master"}, "pull_requests": [
            {"number": 21, "title": "Core", "head": {"ref": "core"}, "state": "closed", "merged_at": "2026-09-01", "draft": False},
            {"number": 22, "title": "API", "head": {"ref": "api"}, "state": "open", "merged_at": None, "draft": True},
        ]}
        stack = build_stack(native)
        self.assertEqual([21, 22], [entry["number"] for entry in stack["entries"]])
        self.assertEqual("MERGED", stack["entries"][0]["state"])
        self.assertTrue(stack["entries"][1]["draft"])
        self.assertEqual("master", stack["baseBranch"])
        self.assertIsNone(build_stack(None))

    @patch("cli.github.shutil.which", return_value="gh")
    def test_listing_fetches_nested_metadata_per_pr_to_avoid_graphql_node_limit(self, unused):
        client = GitHubClient()
        calls = []
        def run(arguments):
            calls.append(arguments)
            if arguments[:2] == ["pr", "list"]:
                return json.dumps([{"number": 1}, {"number": 2}])
            return json.dumps({"number": int(arguments[2]), "body": "Full description"})
        client._run_text = run
        results = client.list_pull_requests("owner/repo", 10000)
        self.assertEqual([1, 2], [item["number"] for item in results])
        self.assertEqual("number", calls[0][-1])
        self.assertEqual(3, len(calls))
        self.assertTrue(all(call[:2] == ["pr", "view"] for call in calls[1:]))

    def test_context_and_snapshots_survive_successive_imports(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            for head in ["a" * 40, "b" * 40]:
                pr = pull_request(headRefOid=head, baseRefOid="c" * 40, body="# Why\n\n- [x] Tested\n\nFull description")
                groups, details, diffs = build_artifacts("owner/repo", "reviewer", [pr], {42: ""})
                write_artifacts(output, groups, details, diffs)
            history = list((output / "history/owner/repo/42").glob("*.json"))
            self.assertEqual(2, len(history))
            current = json.loads((output / "pr/42/details.json").read_text())
            self.assertEqual("b" * 40, current["headSha"])
            self.assertIn("Full description", current["body"])
            self.assertEqual("SUCCESS", current["checkRuns"][0]["conclusion"])

    @patch("cli.github.shutil.which", return_value="gh")
    def test_context_reads_paginated_comments_and_threads(self, unused):
        client = GitHubClient()
        calls = []
        def run(arguments):
            calls.append(arguments)
            if arguments[1] == "graphql":
                return json.dumps({"data": {"repository": {"pullRequest": {"reviewThreads": {"nodes": [{"id": "thread", "isResolved": True}]}}}}})
            return json.dumps([{"id": 1}]) + "\n" + json.dumps([{"id": 2}])
        client._run_text = run
        context = client.get_context("owner/repo", 42)
        self.assertEqual([1, 2], [comment["id"] for comment in context["inlineComments"]])
        self.assertTrue(context["threads"][0]["isResolved"])
        self.assertTrue(all("--paginate" in call for call in calls))
        self.assertTrue(all("mutation" not in " ".join(call) for call in calls))

    @patch("cli.github.shutil.which", return_value="gh")
    def test_full_contents_are_decoded_and_binary_is_explicit(self, unused):
        client = GitHubClient()
        client._run_text = lambda arguments: json.dumps({"encoding": "base64", "content": base64.b64encode(b"hello\n").decode()})
        self.assertEqual("hello\n", client.get_file("owner/repo", "file name.txt", "abc")["text"])
        client._run_text = lambda arguments: json.dumps({"encoding": "base64", "content": base64.b64encode(b"a\x00b").decode()})
        self.assertIn("Binary", client.get_file("owner/repo", "file.bin", "abc")["error"])

    @patch("cli.cli.GitHubClient")
    def test_sync_uses_merge_base_and_read_only_context(self, client_type):
        client = client_type.return_value
        client.get_repository_name.return_value = "owner/repo"
        client.get_viewer_login.return_value = "reviewer"
        client.list_pull_requests.return_value = [pull_request(headRefOid="a" * 40, baseRefOid="b" * 40)]
        client.get_pull_request_diff.return_value = "diff --git a/src/widget.py b/src/widget.py\n@@ -1 +1 @@\n-old\n+new\n"
        client.get_context.return_value = {"comments": [], "reviews": [], "inlineComments": [], "threads": []}
        client.get_merge_base.return_value = "c" * 40
        client.get_refs.return_value = {"head": "a" * 40, "base": "b" * 40}
        client.get_files.return_value = [{"filename": "src/widget.py"}]
        client.get_file.return_value = {"text": "source\n", "error": None}
        with tempfile.TemporaryDirectory() as directory:
            options = build_parser().parse_args(["sync", "owner/repo", "--all", "--output", directory])
            self.assertEqual(0, sync_repository(options))
            client.get_file.assert_any_call("owner/repo", "src/widget.py", "c" * 40)
            client.verify_revision.assert_called_once_with("owner/repo", 42, "a" * 40, "b" * 40)
            self.assertTrue((Path(directory) / "history/owner/repo/42" / ("a" * 40 + ".json")).exists())


if __name__ == "__main__":
    unittest.main()
