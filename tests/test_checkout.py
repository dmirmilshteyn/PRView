import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cli.checkout import sync_checkout, fetch_pull_request
from cli.github import GitHubClient


@unittest.skipUnless(shutil.which("git"), "Git is required for local clone integration")
class CheckoutTests(unittest.TestCase):
    def test_clones_refreshes_and_reads_exact_pr_revision_in_volume(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            def git(*args):
                return subprocess.check_output(["git", *args], stderr=subprocess.DEVNULL, text=True).strip()
            git("init", "-b", "main", str(source))
            git("-C", str(source), "config", "user.email", "test@example.com")
            git("-C", str(source), "config", "user.name", "Test")
            (source / "file.txt").write_text("before\n")
            git("-C", str(source), "add", ".")
            git("-C", str(source), "commit", "-m", "fixture")
            before = git("-C", str(source), "rev-parse", "HEAD")
            config = root / "gitconfig"
            config.write_text(f'[url "{source}"]\n    insteadOf = https://github.com/owner/repo.git\n')
            with patch.dict(os.environ, {"GIT_CONFIG_GLOBAL": str(config), "PRVIEW_REPOSITORIES_DIR": str(root / "volume")}):
                checkout = sync_checkout("owner/repo")
                self.assertEqual(root / "volume/owner/repo", checkout)
                self.assertEqual("before\n", (checkout / "file.txt").read_text())
                (source / "file.txt").write_text("after\n")
                git("-C", str(source), "commit", "-am", "next fixture")
                head = git("-C", str(source), "rev-parse", "HEAD")
                git("-C", str(source), "update-ref", "refs/pull/42/head", head)
                self.assertEqual(checkout, sync_checkout("owner/repo"))
                fetch_pull_request(checkout, 42)
                self.assertEqual(head, git("-C", str(checkout), "rev-parse", "refs/prview/42"))
                client = GitHubClient()
                client.checkout = checkout
                self.assertEqual("before\n", client.get_file("owner/repo", "file.txt", before)["text"])
                self.assertEqual("after\n", client.get_file("owner/repo", "file.txt", head)["text"])
