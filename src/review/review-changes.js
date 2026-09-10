import { comparisonFiles } from "./diff.js";

export function lastSubmittedReview(reviews) {
  return [...reviews].filter((review) => review.revision && (!review.github || review.github.status === "submitted"))
    .sort((left, right) => (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0))[0] ?? null;
}

export function changesSinceReview(current, baseline, baselineRevision) {
  if (!baseline) {
    return null;
  }
  if (current.details.revision === baselineRevision) {
    return { files: [], commits: [] };
  }
  const files = comparisonFiles(current.diff, baseline.diff, baselineRevision);
  const history = current.details.commitHistory;
  const oldHistory = baseline.details.commitHistory;
  let commits = null;
  if (Array.isArray(history)) {
    if (Array.isArray(oldHistory)) {
      const previous = new Set(oldHistory.map((commit) => commit.oid));
      commits = history.filter((commit) => !previous.has(commit.oid));
    } else {
      const index = history.findIndex((commit) => commit.oid === baseline.details.headSha);
      if (index >= 0) {
        commits = history.slice(index + 1);
      }
    }
  }
  return { files, commits };
}
