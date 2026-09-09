import tempfile
import unittest
from pathlib import Path

from cli.artifacts import (
    build_details,
    choose_group,
    parse_diff,
    write_artifacts,
)


def pull_request(**overrides):
    value = {
        "number": 42,
        "url": "https://github.com/acme/widgets/pull/42",
        "title": "Improve widgets",
        "body": "A useful change.\n\nMore detail.",
        "author": {"login": "octocat", "name": "The Octocat"},
        "headRefName": "octocat/widgets",
        "baseRefName": "main",
        "createdAt": "2026-09-01T10:00:00Z",
        "updatedAt": "2026-09-02T11:00:00Z",
        "reviewRequests": [{"login": "reviewer"}],
        "reviews": [],
        "assignees": [{"login": "octocat"}],
        "labels": [{"name": "enhancement"}],
        "milestone": None,
        "isDraft": False,
        "mergeable": "MERGEABLE",
        "reviewDecision": "REVIEW_REQUIRED",
        "changedFiles": 1,
        "additions": 1,
        "deletions": 1,
        "commits": [{"oid": "abc"}],
        "statusCheckRollup": [{"status": "COMPLETED", "conclusion": "SUCCESS"}],
        "files": [{"path": "src/widget.py", "additions": 1, "deletions": 1}],
    }
    value.update(overrides)
    return value


class ArtifactTests(unittest.TestCase):
    def test_requested_review_is_grouped_for_viewer(self):
        self.assertEqual("needsYourReview", choose_group(pull_request(), "reviewer"))

    def test_authored_change_request_is_returned_to_viewer(self):
        value = pull_request(reviewDecision="CHANGES_REQUESTED", reviewRequests=[])

        self.assertEqual("returnedToYou", choose_group(value, "octocat"))

    def test_details_match_local_shape(self):
        details = build_details("acme/widgets", pull_request())

        self.assertEqual("A useful change.", details["description"])
        self.assertEqual("The Octocat", details["author"])
        self.assertEqual("None", details["milestone"])
        self.assertEqual("needs-review", details["status"])
        self.assertEqual("All checks passed", details["checks"])

    def test_diff_is_parsed_into_files_and_hunks(self):
        patch = """diff --git a/src/widget.py b/src/widget.py
index 1111111..2222222 100644
--- a/src/widget.py
+++ b/src/widget.py
@@ -1,2 +1,2 @@
-old_widget()
+new_widget()
 context()
"""

        result = parse_diff(
            patch,
            [{"path": "src/widget.py", "additions": 1, "deletions": 1}],
        )

        self.assertEqual("src/widget.py", result["files"][0]["path"])
        self.assertEqual("modified", result["files"][0]["status"])
        self.assertEqual(["-old_widget()", "+new_widget()", " context()"], result["files"][0]["hunks"][0]["lines"])

    def test_writes_expected_artifact_paths(self):
        groups = {
            "yourChanges": [],
            "needsYourReview": [],
            "returnedToYou": [],
            "approved": [],
            "waitingForReviewers": [],
            "drafts": [],
            "waitingForAuthor": [],
        }

        with tempfile.TemporaryDirectory() as temporary_directory:
            write_artifacts(
                temporary_directory,
                groups,
                {42: {"number": 42}},
                {42: {"files": []}},
            )

            output = Path(temporary_directory)
            self.assertTrue((output / "prs.json").is_file())
            self.assertTrue((output / "pr" / "42" / "details.json").is_file())
            self.assertTrue((output / "pr" / "42" / "diff.json").is_file())


if __name__ == "__main__":
    unittest.main()
