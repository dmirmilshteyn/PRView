import { expect, test } from "bun:test";
import { hunksForReference, makeHunks, numberedLines, splitRows } from "../src/review/diff.js";

test("tour reference diffs retain both sides and exclude unrelated hunks", () => {
  const first = { header: "@@ -4,2 +4,2 @@", lines: [" context", "-before", "+after"] };
  const other = { header: "@@ -80 +80 @@", lines: ["-old", "+new"] };
  for (const side of ["LEFT", "RIGHT"]) {
    const selected = hunksForReference([first, other], { side, start: 5, end: 5 });
    expect(selected).toEqual([first]);
    const unified = numberedLines(selected[0]);
    expect(unified.map((row) => row.marker)).toEqual([" ", "-", "+"]);
    const split = splitRows(unified);
    expect(split[1].left.text).toBe("before");
    expect(split[1].right.text).toBe("after");
  }
});

test("references handle added/deleted files, renames and unchanged cited ranges", () => {
  const added = makeHunks({ path: "new.js", baseContent: { text: "" }, headContent: { text: "added\n" } }, 3, false);
  expect(hunksForReference(added, { side: "RIGHT", start: 1, end: 1 })).toHaveLength(1);
  const deleted = makeHunks({ path: "old.js", baseContent: { text: "removed\n" }, headContent: { text: "" } }, 3, false);
  expect(hunksForReference(deleted, { side: "LEFT", start: 1, end: 1 })).toHaveLength(1);
  const renamed = makeHunks({ path: "new.js", oldPath: "old.js", baseContent: { text: "old\n" }, headContent: { text: "new\n" } }, 3, false);
  expect(hunksForReference(renamed, { side: "RIGHT", start: 1, end: 1 })).toHaveLength(1);
  expect(hunksForReference(renamed, { side: "RIGHT", start: 50, end: 55 })).toEqual([]);
  expect(hunksForReference([{ header: "@@ -5,0 +6,2 @@", lines: ["+a", "+b"] }], { side: "LEFT", start: 6, end: 6 })).toHaveLength(1);
});
