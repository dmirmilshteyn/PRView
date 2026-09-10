import { expect, test } from "bun:test";
import { changesSinceReview, lastSubmittedReview } from "../src/review/review-changes.js";

test("last review excludes failed and cancelled submissions and uses submission order", () => {
  const reviews = [
    { revision: "old", createdAt: "2026-09-01" },
    { revision: "failed", createdAt: "2026-09-09", github: { status: "failed" } },
    { revision: "cancelled", createdAt: "2026-09-10", github: { status: "cancelled" } },
    { revision: "new", createdAt: "2026-09-02", github: { status: "submitted" } },
  ];
  expect(lastSubmittedReview(reviews).revision).toBe("new");
  expect(lastSubmittedReview([])).toBeNull();
});

function snapshot(revision, text, commits) {
  return { details: { revision, headSha: revision, commitHistory: commits }, diff: { files: [{ path: "app.js", headContent: { text } }] } };
}

test("compares file contents and detects new or rewritten commit IDs", () => {
  const baseline = snapshot("old", "before", [{ oid: "old" }]);
  const current = snapshot("new", "after", [{ oid: "rewritten" }, { oid: "new" }]);
  const result = changesSinceReview(current, baseline, "old");
  expect(result.files.map((file) => file.path)).toEqual(["app.js"]);
  expect(result.commits.map((commit) => commit.oid)).toEqual(["rewritten", "new"]);
  expect(changesSinceReview(snapshot("new", "before", []), baseline, "old").files).toEqual([]);
});

test("same snapshot is unchanged even without content, and missing history stays unknown", () => {
  const baseline = snapshot("old", undefined, undefined);
  expect(changesSinceReview(baseline, baseline, "old")).toEqual({ files: [], commits: [] });
  expect(changesSinceReview(snapshot("new", "after", undefined), null, "old")).toBeNull();
  const result = changesSinceReview(snapshot("new", "after", undefined), baseline, "old");
  expect(result.commits).toBeNull();
  expect(result.files[0].comparisonUnavailable).toBe(true);
  expect(changesSinceReview(snapshot("new", "after", [{ oid: "old" }, { oid: "new" }]), baseline, "old").commits).toEqual([{ oid: "new" }]);
});
