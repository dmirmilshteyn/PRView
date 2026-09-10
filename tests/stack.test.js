import { expect, test } from "bun:test";
import { getPullRequestStack, hasPullRequestApproval, nextStackPullRequest, pullRequestCI, stackEntryStatus } from "../src/stack/stack.js";

function pr(number, branch, baseBranch) {
  return { number, branch, baseBranch, repository: "owner/repo", title: `PR ${number}`, draft: false };
}

test("approval advances from base toward tip without wrapping or selecting unavailable PRs", () => {
  const stack = { entries: [
    { number: 7, available: true, state: "OPEN" },
    { number: 3, available: true, state: "OPEN" },
    { number: 9, available: true, state: "OPEN" },
  ] };
  expect(nextStackPullRequest(stack, "9")?.number).toBe(3);
  expect(nextStackPullRequest(stack, 3)?.number).toBe(7);
  expect(nextStackPullRequest(stack, 7)).toBeNull();
  expect(nextStackPullRequest(stack, 42)).toBeNull();
  expect(nextStackPullRequest(null, 9)).toBeNull();
  for (const entry of [{ available: false, state: "OPEN" }, { available: true, state: "MERGED" }, { available: true, state: "CLOSED" }]) {
    stack.entries[1] = { number: 3, ...entry };
    expect(nextStackPullRequest(stack, 9)?.number).toBe(7);
  }
});

test("CI requires checks and distinguishes pending, failing and successful rollups", () => {
  expect(pullRequestCI({})).toBe("none");
  expect(pullRequestCI({ checkRuns: [] })).toBe("none");
  expect(pullRequestCI({ checkRuns: [{ status: "COMPLETED", conclusion: "SUCCESS" }, { state: "SUCCESS" }, { status: "COMPLETED", conclusion: "SKIPPED" }] })).toBe("success");
  expect(pullRequestCI({ checkRuns: [{ state: "SUCCESS" }, { status: "IN_PROGRESS", conclusion: "" }] })).toBe("pending");
  expect(pullRequestCI({ checkRuns: [{ state: "PENDING" }, { state: "FAILURE" }] })).toBe("failure");
  expect(pullRequestCI({ checkRuns: [{ status: "COMPLETED", conclusion: "CANCELLED" }] })).toBe("failure");
  expect(pullRequestCI({ checkRuns: [{ status: "COMPLETED", conclusion: null }] })).toBe("pending");
});

test("CI in stack entries comes from each member's own repository and checks", () => {
  const current = { ...pr(1, "core", "main"), checkRuns: [{ state: "SUCCESS" }], stack: { entries: [{ number: 1 }, { number: 2 }, { number: 3 }] } };
  const stack = getPullRequestStack(current, [current, { ...pr(2, "api", "core"), ci: "failure" }, { ...pr(3, "other", "main"), repository: "other/repo", ci: "success" }]);
  expect(stack.entries.map((entry) => entry.ci)).toEqual(["none", "failure", "success"]);
});

test("branch chains without native metadata never produce a stack", () => {
  const imported = [pr(1, "core", "main"), pr(2, "api", "core"), pr(3, "ui", "api")];
  for (const current of imported) {
    expect(getPullRequestStack(current, imported)).toBeNull();
    expect(getPullRequestStack({ ...current, stack: null }, imported)).toBeNull();
  }
});

test("native ordering is reversed for top-first display, independent of PR numbers and branches", () => {
  const imported = [pr(9, "core", "main"), pr(3, "api", "main"), pr(7, "ui", "main")];
  const native = { number: 12, baseBranch: "master", entries: imported.map((entry) => ({ ...entry, state: "OPEN" })) };
  for (const current of imported) {
    const stack = getPullRequestStack({ ...current, stack: native }, imported);
    expect(stack.entries.map((entry) => entry.number)).toEqual([7, 3, 9]);
    expect(stack.baseBranch).toBe("master");
    expect(stack.entries.every((entry) => entry.available)).toBe(true);
  }
});

test("unsynced and cross-repository members are retained without broken local links", () => {
  const current = { ...pr(1, "core", "main"), stack: { number: 5, baseBranch: "main", entries: [{ number: 1, state: "OPEN" }, { number: 2, state: "MERGED" }] } };
  const stack = getPullRequestStack(current, [current, { ...pr(2, "api", "core"), repository: "other/repo" }]);
  expect(stack.entries[0].available).toBe(false);
  expect(stack.entries[1].available).toBe(true);
  expect(getPullRequestStack({ ...current, number: 8 }, [current])).toBeNull();
});

test("status labels distinguish readiness for review from merged, closed, queued and draft", () => {
  expect(stackEntryStatus({ state: "OPEN", draft: false }).description).toBe("Ready for review");
  expect(stackEntryStatus({ state: "OPEN", draft: true }).label).toBe("Draft");
  expect(stackEntryStatus({ state: "MERGED", draft: false }).label).toBe("Merged");
  expect(stackEntryStatus({ state: "CLOSED", draft: false }).label).toBe("Closed");
  expect(stackEntryStatus({ state: "QUEUED", draft: false }).label).toBe("Queued");
});

test("one approval is enough even when the overall review decision is not approved", () => {
  expect(hasPullRequestApproval({ reviewDecision: "CHANGES_REQUESTED", github: { reviews: [{ state: "CHANGES_REQUESTED" }, { state: "APPROVED" }] } })).toBe(true);
  expect(hasPullRequestApproval({ reviewHistory: [{ state: "APPROVED" }] })).toBe(true);
  expect(hasPullRequestApproval({ github: { reviews: [{ state: "DISMISSED" }, { state: "COMMENTED" }] } })).toBe(false);
  expect(hasPullRequestApproval({ github: { reviews: [] }, reviewHistory: [{ state: "APPROVED" }] })).toBe(false);
  expect(hasPullRequestApproval({})).toBe(false);
});

test("stack approval tags come from each PR's synced reviews in the same repository", () => {
  const current = { ...pr(1, "core", "main"), github: { reviews: [{ state: "APPROVED" }] }, stack: { entries: [{ number: 1 }, { number: 2 }, { number: 3 }, { number: 4 }] } };
  const imported = [pr(1, "core", "main"), { ...pr(2, "api", "core"), approved: true }, { ...pr(3, "ui", "api"), approved: false }, { ...pr(4, "other", "main"), repository: "other/repo", approved: true }];
  expect(getPullRequestStack(current, imported).entries.map(({ number, approved }) => ({ number, approved }))).toEqual([
    { number: 4, approved: false }, { number: 3, approved: false }, { number: 2, approved: true }, { number: 1, approved: true },
  ]);
});
