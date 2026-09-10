import { expect, test } from "bun:test";
import { nextUnreviewedIndex, ignoresReviewShortcut } from "../src/review/review-navigation.js";
import { filterPullRequests } from "../src/dashboard-filters.js";
import { unresolvedThreads } from "../src/review/UnresolvedThreads.jsx";

test("review-and-advance skips reviewed entries, wraps, and stops when done", () => {
  const keys = ["a", "b", "c", "d"];
  expect(nextUnreviewedIndex(keys, 0, new Set(["b"])) ).toBe(2);
  expect(nextUnreviewedIndex(keys, 3, new Set(["a"]))).toBe(1);
  expect(nextUnreviewedIndex(keys, 0, new Set(["b", "c", "d"]))).toBeNull();
  expect(nextUnreviewedIndex(["a"], 0, new Set())).toBeNull();
  expect(nextUnreviewedIndex([], 0, new Set())).toBeNull();
});

test("review shortcuts ignore typing, modifiers, composition, and repeated keys", () => {
  const event = { target: { closest: () => null } };
  expect(ignoresReviewShortcut(event)).toBe(false);
  for (const key of ["defaultPrevented", "repeat", "isComposing", "metaKey", "ctrlKey", "altKey", "shiftKey"]) {
    expect(ignoresReviewShortcut({ ...event, [key]: true })).toBe(true);
  }
  expect(ignoresReviewShortcut({ target: { closest: () => ({}) } })).toBe(true);
});

test("section filters combine search, author, labels, CI and conflicts without mutating items", () => {
  const items = [
    { number: 12, title: "Fix parser", author: "Alice", labels: ["bug"], ci: "failure", mergeConflict: true },
    { number: 13, title: "Add parser", author: "Bob", labels: ["feature"], ci: "success", mergeConflict: false },
  ];
  const empty = { query: "", author: "", label: "", ci: "", conflicts: false };
  expect(filterPullRequests(items, empty)).toEqual(items);
  expect(filterPullRequests(items, { query: "PARSER", author: "Alice", label: "bug", ci: "failure", conflicts: true }).map((pr) => pr.number)).toEqual([12]);
  expect(filterPullRequests(items, { ...empty, query: "#13" }).map((pr) => pr.number)).toEqual([13]);
  expect(filterPullRequests(items, { ...empty, author: "Alice", ci: "success" })).toEqual([]);
  expect(filterPullRequests([{ number: 1, title: "Legacy" }], { ...empty, label: "bug" })).toEqual([]);
  expect(items.length).toBe(2);
});

test("unresolved sidebar keeps replies with their root and excludes resolved threads", () => {
  const details = { github: {
    threads: [{ id: "open", isResolved: false, comments: { nodes: [{ databaseId: 1 }] } }, { id: "done", isResolved: true, comments: { nodes: [{ databaseId: 2 }] } }, { id: "missing", isResolved: false }],
    inlineComments: [{ id: 1, body: "Root" }, { id: 2 }, { id: 4, in_reply_to_id: 1, created_at: "2026-09-03" }, { id: 3, in_reply_to_id: 1, created_at: "2026-09-02" }],
  } };
  const result = unresolvedThreads(details);
  expect(result.map((entry) => entry.thread.id)).toEqual(["open", "missing"]);
  expect(result[0].replies.map((reply) => reply.id)).toEqual([3, 4]);
  expect(result[1].root).toBeUndefined();
  expect(unresolvedThreads({})).toEqual([]);
});
