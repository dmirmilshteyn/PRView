import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cli.cli import build_parser, sync_repository
from test_artifacts import pull_request


class IncrementalSyncTests(unittest.TestCase):
    @patch("cli.cli.fetch_pull_request")
    @patch("cli.cli.sync_checkout", return_value=Path("/tmp/clone"))
    @patch("cli.cli.GitHubClient")
    def test_failure_preserves_successes_and_retry_reuses_code(self, client_type, clone, fetch):
        client = client_type.return_value
        client.get_repository_name.return_value = "owner/repo"
        client.get_viewer_login.return_value = "reviewer"
        client.list_pull_request_numbers.return_value = [1, 2, 3]
        client.get_pull_request.side_effect = lambda repo, number: pull_request(number=number, headRefOid="a" * 40)
        client.get_refs.return_value = {"head": "a" * 40, "base": "b" * 40}
        client.get_pull_request_diff.return_value = ""
        client.get_files.return_value = []
        client.get_merge_base.return_value = "c" * 40
        failed = {2}
        def context(repo, number):
            if number in failed:
                raise TimeoutError("individual PR timeout")
            return {"reviews": [], "comments": []}
        client.get_context.side_effect = context
        with tempfile.TemporaryDirectory() as directory:
            options = build_parser().parse_args(["sync", "owner/repo", "--all", "--output", directory])
            self.assertEqual(1, sync_repository(options))
            folder = Path(directory) / "repos/owner/repo"
            self.assertTrue((folder / "pr/1/snapshot.json").exists())
            self.assertFalse((folder / "pr/2/snapshot.json").exists())
            self.assertTrue((folder / "pr/3/snapshot.json").exists())
            self.assertEqual(2, json.loads((folder / "sync.json").read_text())["completed"])
            failed.clear()
            client.get_pull_request_diff.reset_mock()
            self.assertEqual(0, sync_repository(options))
            client.get_pull_request_diff.assert_called_once_with("owner/repo", 2)
            self.assertEqual(3, json.loads((folder / "sync.json").read_text())["completed"])
            # A failed revision verification must not replace the published pair.
            before = (folder / "pr/1/snapshot.json").read_bytes()
            client.verify_revision.side_effect = RuntimeError("head changed")
            self.assertEqual(1, sync_repository(options))
            self.assertEqual(before, (folder / "pr/1/snapshot.json").read_bytes())
