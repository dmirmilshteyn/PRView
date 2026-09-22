import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from cli.repositories import repository_path


def sync_checkout(repository):
    root = os.environ.get("PRVIEW_REPOSITORIES_DIR", "/var/lib/prview/repositories")
    # Reuse the identity validation used for artifact paths.
    repository_path(root, repository)
    destination = Path(root) / repository.lower()
    destination.parent.mkdir(parents=True, exist_ok=True)
    def git(*args):
        subprocess.run(["git", "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", *args], check=True, capture_output=True, text=True, timeout=600)
    if (destination / ".git").exists():
        git("-C", str(destination), "fetch", "--prune", "origin")
        # The shared checkout is the default branch. PR refs are stored separately.
        git("-C", str(destination), "remote", "set-head", "origin", "--auto")
        git("-C", str(destination), "reset", "--hard", "origin/HEAD")
    else:
        temporary = Path(tempfile.mkdtemp(prefix=".clone-", dir=destination.parent))
        try:
            git("clone", "--", f"https://github.com/{repository}.git", str(temporary))
            temporary.rename(destination)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)
    return destination


def fetch_pull_request(checkout, number):
    subprocess.run(["git", "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", "-C", str(checkout), "fetch", "origin", f"+refs/pull/{number}/head:refs/prview/{number}"], check=True, capture_output=True, text=True, timeout=600)
