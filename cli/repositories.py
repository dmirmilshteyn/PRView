import fcntl
import json
import re
import shutil
from contextlib import contextmanager
from pathlib import Path


def repository_path(output, repository):
    if not isinstance(repository, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) or any(part in (".", "..") for part in repository.split("/")):
        raise ValueError("Use a repository in OWNER/REPO form")
    return Path(output) / "repos" / repository.lower()


def read_workspace(output):
    file = Path(output) / "workspace.json"
    if file.exists():
        return json.loads(file.read_text())
    return {"activeRepository": None, "repositories": []}


def register_repository(output, repository):
    from cli.artifacts import write_json
    repository_path(output, repository)
    workspace = read_workspace(output)
    workspace["repositories"] = sorted({item.lower(): item for item in [*workspace["repositories"], repository]}.values(), key=str.lower)
    workspace["activeRepository"] = repository
    write_json(Path(output) / "workspace.json", workspace)


def preserve_legacy_imports(output):
    from cli.artifacts import write_json
    output = Path(output)
    if (output / "workspace.json").exists():
        return
    index = output / "prs.json"
    if not index.exists():
        return
    groups = json.loads(index.read_text())
    repositories = {}
    active_repository = None
    for item in [item for items in groups.values() for item in items]:
        file = output / "pr" / str(item["number"]) / "details.json"
        if file.exists():
            active_repository = json.loads(file.read_text()).get("repository")
            if active_repository:
                break
    for file in (output / "pr").glob("*/details.json"):
        details = json.loads(file.read_text())
        repository = details.get("repository")
        if not repository:
            continue
        folder = repository_path(output, repository)
        repositories[repository.lower()] = repository
        destination = folder / "pr" / file.parent.name
        if not destination.exists():
            shutil.copytree(file.parent, destination)
    for repository in repositories.values():
        folder = repository_path(output, repository)
        selected = {}
        for group, items in groups.items():
            selected[group] = [item for item in items if (folder / "pr" / str(item["number"]) / "details.json").exists()]
        if not (folder / "prs.json").exists():
            write_json(folder / "prs.json", selected)
        legacy_comments = output / "comments.json"
        if repository == active_repository and legacy_comments.exists() and not (folder / "comments.json").exists():
            shutil.copy2(legacy_comments, folder / "comments.json")
        register_repository(output, repository)
    if active_repository:
        register_repository(output, active_repository)


@contextmanager
def workspace_lock(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    with (output / ".workspace.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another import or repository change is running. Try again when it finishes.")
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)
