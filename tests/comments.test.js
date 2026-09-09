import { expect, test } from "bun:test";
import { anchorLocation, placeComments } from "../src/review/comment-placement.js";

function note(id, side, start, end, revision) {
  return { id, revision, anchor: { side, start, end, revision, excerpt: "original code" } };
}

test("line and range comments attach below the correct side and ending line", () => {
  const notes = [note("old", "LEFT", 8, 8, "a"), note("new", "RIGHT", 8, 8, "a"), note("range", "RIGHT", 8, 11, "a")];
  const result = placeComments(notes, { open: false }, new Set(["LEFT:8", "RIGHT:8", "RIGHT:11"]), "a", "a");
  expect(result.groups.get("LEFT:8").map((item) => item.id)).toEqual(["old"]);
  expect(result.groups.get("RIGHT:8").map((item) => item.id)).toEqual(["new"]);
  expect(result.groups.get("RIGHT:11").map((item) => item.id)).toEqual(["range"]);
  expect(result.remaining).toEqual([]);
});

test("draft appears once inline and moves to the fallback if its line is hidden", () => {
  const draft = { open: true, anchor: { side: "RIGHT", start: 5, end: 7, revision: "a" } };
  expect(placeComments([], draft, new Set(["RIGHT:7"]), "a", "a").draftLine).toBe("RIGHT:7");
  expect(placeComments([], draft, new Set(["LEFT:7"]), "a", "a").draftLine).toBeNull();
  expect(placeComments([], { ...draft, open: false }, new Set(["RIGHT:7"]), "a", "a").draftLine).toBeNull();
});

test("previous-revision comments never appear beside unrelated current lines", () => {
  const old = note("old", "RIGHT", 5, 5, "a");
  const result = placeComments([old], { open: false }, new Set(["RIGHT:5"]), "b", "b");
  expect(result.groups.size).toBe(0);
  expect(result.remaining).toEqual([old]);
});

test("incremental comparisons map the previous head's comments to the left side", () => {
  const previous = note("previous", "RIGHT", 8, 8, "a");
  const current = note("current", "RIGHT", 8, 8, "b");
  const result = placeComments([previous, current], { open: false }, new Set(["LEFT:8", "RIGHT:8"]), "b", "a");
  expect(result.groups.get("LEFT:8")[0].id).toBe("previous");
  expect(result.groups.get("RIGHT:8")[0].id).toBe("current");
  expect(anchorLocation({ side: "LEFT", sourceSide: "RIGHT", revision: "a", end: 8 }, "a", "a")).toEqual({ side: "RIGHT", line: 8 });
});

test("file comments, hidden ranges and legacy revision anchors remain accessible", () => {
  const file = { id: "file", anchor: null, revision: "a" };
  const hidden = note("hidden", "RIGHT", 4, 10, "a");
  const legacy = { id: "legacy", revision: "old", anchor: { side: "RIGHT", start: 5, end: 5 } };
  const result = placeComments([file, hidden, legacy], { open: false }, new Set(["RIGHT:5"]), "a", "a");
  expect(result.groups.size).toBe(0);
  expect(result.remaining).toEqual([file, hidden, legacy]);
});
