import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cli.artifacts import merge_groups, write_artifacts, write_json
from cli.cli import build_parser, manage_repository
from cli.repositories import preserve_legacy_imports, read_workspace, repository_path


class RepositoryTests(unittest.TestCase):
    def test_commands_require_explicit_repository(self):
        for command in ("track", "sync"):
            options = build_parser().parse_args([command, "owner/repo", "42"])
            self.assertEqual((options.repository, options.number), ("owner/repo", 42))
            for arguments in (["42"], [], ["owner/repo", "0"]):
                with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                    build_parser().parse_args([command, *arguments])

    def test_repository_registration_and_selection(self):
        with tempfile.TemporaryDirectory() as output, patch("cli.cli.GitHubClient") as client:
            client.return_value.get_repository_name.return_value = "Owner/Repo"
            options = build_parser().parse_args(["repo", "track", "owner/repo", "--output", output])
            self.assertEqual(manage_repository(options), 0)
            self.assertEqual(read_workspace(output), {"activeRepository": "Owner/Repo", "repositories": ["Owner/Repo"]})
            client.return_value.get_repository_name.assert_called_once_with("owner/repo")
            options = build_parser().parse_args(["repo", "use", "OWNER/REPO", "--output", output])
            self.assertEqual(manage_repository(options), 0)
            client.return_value.get_repository_name.assert_called_once()
            options.repository = "other/repo"
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(manage_repository(options), 1)
            self.assertEqual(read_workspace(output)["repositories"], ["Owner/Repo"])

    def test_imports_with_same_number_remain_separate(self):
        with tempfile.TemporaryDirectory() as output:
            for repository in ("owner/one", "owner/two"):
                write_artifacts(output, {"yourChanges": [{"number": 42}]}, {42: {"number": 42, "repository": repository}}, {42: {"files": []}})
            for repository in ("owner/one", "owner/two"):
                detail = repository_path(output, repository) / "pr/42/details.json"
                self.assertEqual(json.loads(detail.read_text())["repository"], repository)
            groups = merge_groups(output, "owner/one", {"yourChanges": [{"number": 43}]}, {43: {}})
            self.assertEqual([item["number"] for item in groups["yourChanges"]], [43, 42])
            self.assertEqual(read_workspace(output)["repositories"], ["owner/one", "owner/two"])

    def test_legacy_migration_preserves_active_repo_and_notes(self):
        with tempfile.TemporaryDirectory() as output:
            root = Path(output)
            write_json(root / "prs.json", {"yourChanges": [{"number": 42}]})
            write_json(root / "pr/42/details.json", {"repository": "owner/current", "number": 42})
            write_json(root / "pr/99/details.json", {"repository": "owner/stale", "number": 99})
            write_json(root / "comments.json", [{"pullRequestNumber": 42, "comment": "Keep me"}])
            preserve_legacy_imports(root)
            preserve_legacy_imports(root)
            self.assertEqual(read_workspace(root)["activeRepository"], "owner/current")
            self.assertEqual((root / "comments.json").read_text(), (repository_path(root, "owner/current") / "comments.json").read_text())
            self.assertTrue((root / "pr/42/details.json").exists())
            self.assertEqual(json.loads((repository_path(root, "owner/stale") / "prs.json").read_text()), {"yourChanges": []})

    def test_failed_registration_does_not_add_repository(self):
        with tempfile.TemporaryDirectory() as output, patch("cli.cli.GitHubClient") as client:
            client.return_value.get_repository_name.side_effect = RuntimeError("Not found")
            options = build_parser().parse_args(["repo", "track", "owner/missing", "--output", output])
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(manage_repository(options), 1)
            self.assertEqual(read_workspace(output)["repositories"], [])
