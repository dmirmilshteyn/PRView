import { expect, test } from "bun:test";
import { mergeReadiness } from "../src/review/merge-readiness.js";

function readyPR() {
  return { liveState: "OPEN", draft: false, liveMergeable: true, mergeConflict: false, mergeState: "clean", reviewDecision: "Approved", reviewRequests: [], checkRuns: [{ state: "SUCCESS" }], github: { threads: [] } };
}

test("checklist identifies all blockers and keeps saved data labeled", () => {
  const result = mergeReadiness({ ...readyPR(), draft: true, mergeConflict: true, mergeState: "blocked", checkRuns: [{ state: "FAILURE" }], reviewDecision: "Changes requested", reviewRequests: [{ login: "alice" }], github: { threads: [{ isResolved: false }, { isResolved: true }] } });
  expect(result.summary).toBe("Needs attention");
  expect(result.rows.every((row) => row.status === "attention")).toBe(true);
  expect(result.rows.find((row) => row.label === "Review threads").detail).toBe("1 unresolved thread");
  expect(result.rows.filter((row) => row.saved).map((row) => row.label)).toEqual(["Approvals", "Review threads"]);
});

test("unknown live mergeability and missing data never imply readiness", () => {
  const result = mergeReadiness({ ...readyPR(), liveMergeable: null, mergeable: true, mergeState: "unknown", github: undefined });
  expect(result.summary).toBe("Status incomplete");
  expect(result.rows.find((row) => row.label === "Merge conflicts").status).toBe("unknown");
  expect(mergeReadiness({}).summary).toBe("Status incomplete");
  expect(mergeReadiness({ ...readyPR(), liveState: "MERGED" }).summary).toBe("Merged");
});

test("confirmed requirements pass, and raw decisions override formatted summaries", () => {
  expect(mergeReadiness(readyPR()).summary).toBe("No known blockers");
  const result = mergeReadiness({ ...readyPR(), reviewDecision: "In review", reviewDecisionState: "REVIEW_REQUIRED" });
  expect(result.rows.find((row) => row.label === "Approvals").status).toBe("attention");
  expect(mergeReadiness({ ...readyPR(), reviewDecisionState: "" }).rows.find((row) => row.label === "Approvals").detail).toBe("No approval requirement reported");
});
