import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { readReview, updateReview } from "../lib/review-store.js";
import { comparisonFiles, makeHunks, numberedLines, splitRows } from "../src/review/diff.js";
import { applyOperation, draftKey, emptyReview } from "../src/review/state.js";

const directories = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function temporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "prview-review-"));
  directories.push(root);
  return root;
}

function note(id) {
  return { id, revision: "commit-a", filePath: "src/app.js", body: "Handle null input", anchor: { side: "RIGHT", start: 4, end: 6, excerpt: "original code" }, severity: "warning", resolved: false, createdAt: "2026-09-09T00:00:00Z", replies: [] };
}

test("legacy review records gain missing fields without losing notes, drafts, or preferences", async () => {
  const root = await temporaryRoot();
  const folder = path.join(root, createHash("sha256").update("owner/repo").digest("hex"));
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, "42.json");
  const legacy = { version: 1, notes: [note("legacy")], drafts: { saved: { body: "Unfinished thought" } }, preferences: { split: true }, pinned: true };
  await writeFile(file, JSON.stringify(legacy));
  const loaded = await readReview(root, "owner/repo", 42);
  expect(loaded).toEqual({ ...emptyReview(), ...legacy });
  expect(loaded.reviews.filter((review) => review.body?.trim())).toEqual([]);
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual(legacy);
  await updateReview(root, "owner/repo", 42, { type: "pin", value: false });
  const saved = await readReview(root, "owner/repo", 42);
  expect(saved.notes).toEqual(legacy.notes);
  expect(saved.drafts).toEqual(legacy.drafts);
  expect(saved.preferences).toEqual(legacy.preferences);
  expect(saved.reviews).toEqual([]);
  expect(saved.pinned).toBe(false);
});

test("local state survives re-reading and isolates repositories sharing a PR number", async () => {
  const root = await temporaryRoot();
  const draft = { body: "unfinished", anchor: null, severity: "question", replyDrafts: {}, open: true };
  await updateReview(root, "owner/one", 42, { type: "draft", revision: "commit-a", filePath: "a.js", draft });
  await updateReview(root, "owner/one", 42, { type: "reviewed", filePath: "a.js", revision: "commit-a", fingerprint: "file-hash", value: true });
  await updateReview(root, "owner/one", 42, { type: "position", revision: "commit-a", position: { filePath: "a.js", offset: 73 } });
  await updateReview(root, "owner/one", 42, { type: "preferences", preferences: { split: true } });
  await updateReview(root, "owner/one", 42, { type: "fileView", filePath: "a.js", revision: "commit-a", view: { context: 23, full: true, fullSide: "RIGHT", collapsed: false } });
  const state = await readReview(root, "owner/one", 42);
  expect(state.drafts[draftKey("commit-a", "a.js")]).toEqual(draft);
  expect(state.reviewed["a.js"].revision).toBe("commit-a");
  expect(state.positions["commit-a"].offset).toBe(73);
  expect(state.preferences.split).toBe(true);
  expect(state.fileViews[draftKey("commit-a", "a.js")].context).toBe(23);
  expect((await readReview(root, "owner/two", 42)).reviewed).toEqual({});
});

test("pinning persists per repository and unpinning preserves review data", async () => {
  const root = await temporaryRoot();
  await Promise.all([
    updateReview(root, "owner/repo", 1, { type: "pin", value: true }),
    updateReview(root, "owner/repo", 1, { type: "note", note: note("pin-note") }),
  ]);
  expect((await readReview(root, "owner/repo", 1)).pinned).toBe(true);
  expect((await readReview(root, "other/repo", 1)).pinned).not.toBe(true);
  await updateReview(root, "owner/repo", 1, { type: "pin", value: false });
  const state = await readReview(root, "owner/repo", 1);
  expect(state.pinned).toBe(false);
  expect(state.notes).toHaveLength(1);
  await expect(updateReview(root, "owner/repo", 1, { type: "pin", value: "true" })).rejects.toThrow("Invalid review operation");
});

test("concurrent notes, retries and replies retain every thread and its original anchor", async () => {
  const root = await temporaryRoot();
  await Promise.all(Array.from({ length: 20 }, (_, index) => updateReview(root, "owner/repo", 1, { type: "note", note: note(String(index)) })));
  await updateReview(root, "owner/repo", 1, { type: "note", note: note("0") });
  const reply = { id: "reply-1", body: "Confirmed", createdAt: "2026-09-09T00:00:00Z" };
  await Promise.all([
    updateReview(root, "owner/repo", 1, { type: "reply", id: "0", reply }),
    updateReview(root, "owner/repo", 1, { type: "resolve", id: "0", resolved: true }),
  ]);
  await updateReview(root, "owner/repo", 1, { type: "reply", id: "0", reply });
  await updateReview(root, "owner/repo", 1, { type: "reviewed", filePath: "src/app.js", revision: "commit-b", fingerprint: "new-hash", value: true });
  const state = await readReview(root, "owner/repo", 1);
  expect(state.notes).toHaveLength(20);
  const first = state.notes.find((item) => item.id === "0");
  expect(first.replies).toHaveLength(1);
  expect(first.resolved).toBe(true);
  expect(first.revision).toBe("commit-a");
  expect(first.anchor.excerpt).toBe("original code");
});

test("invalid anchors and path traversal fail without writing", async () => {
  const root = await temporaryRoot();
  await expect(updateReview(root, "../repo", 1, { type: "baseline", revision: "a" })).rejects.toThrow();
  await expect(updateReview(root, "owner/repo", -1, { type: "baseline", revision: "a" })).rejects.toThrow();
  await expect(updateReview(root, "owner/repo", 1, { type: "note", note: { ...note("bad"), anchor: { side: "RIGHT", start: 8, end: 3, excerpt: "bad" } } })).rejects.toThrow();
  expect((await readReview(root, "owner/repo", 1)).notes).toHaveLength(0);
});

test("final reviews persist locally, clear only their draft and are idempotent", async () => {
  const root = await temporaryRoot();
  await updateReview(root, "owner/repo", 1, { type: "reviewDraft", revision: "commit-a", draft: { event: "REQUEST_CHANGES", body: "Cover the boundary case" } });
  await updateReview(root, "owner/repo", 1, { type: "reviewDraft", revision: "commit-b", draft: { event: "COMMENT", body: "Other snapshot draft" } });
  expect((await readReview(root, "owner/repo", 1)).reviewDrafts["commit-a"].event).toBe("REQUEST_CHANGES");
  const review = { id: "review-1", revision: "commit-a", event: "REQUEST_CHANGES", body: "Cover the boundary case", source: "local", createdAt: "2026-09-09T04:00:00Z" };
  await Promise.all([
    updateReview(root, "owner/repo", 1, { type: "finalReview", review }),
    updateReview(root, "owner/repo", 1, { type: "note", note: note("inline-1") }),
  ]);
  await updateReview(root, "owner/repo", 1, { type: "finalReview", review });
  const state = await readReview(root, "owner/repo", 1);
  expect(state.reviews).toEqual([review]);
  expect(state.reviewDrafts["commit-a"]).toEqual({ event: "COMMENT", body: "" });
  expect(state.reviewDrafts["commit-b"].body).toBe("Other snapshot draft");
  expect(state.notes).toHaveLength(1);
  expect((await readReview(root, "owner/other", 1)).reviews).toEqual([]);
});

test("review actions validate feedback and require explicitly local metadata", async () => {
  const root = await temporaryRoot();
  const review = { id: "review-1", revision: "commit-a", event: "APPROVE", body: "", source: "local", createdAt: "2026-09-09T04:00:00Z" };
  await updateReview(root, "owner/repo", 1, { type: "finalReview", review });
  for (const invalid of [{ event: "COMMENT", body: " " }, { event: "REQUEST_CHANGES", body: "" }, { event: "MERGE" }, { source: "github" }, { createdAt: "invalid" }]) {
    await expect(updateReview(root, "owner/repo", 1, { type: "finalReview", review: { ...review, ...invalid } })).rejects.toThrow("Invalid review operation");
  }
  const legacy = emptyReview();
  delete legacy.reviews;
  delete legacy.reviewDrafts;
  expect(applyOperation(legacy, { type: "finalReview", review }).reviews).toEqual([review]);
});

test("old and new line numbers, inserted lines and split alignment remain correct", () => {
  const rows = numberedLines({ header: "@@ -40,3 +40,4 @@", lines: [" context", "-old", "+new", "+extra", " tail", "\\ No newline at end of file"] });
  expect(rows.map((row) => [row.oldLine, row.newLine])).toEqual([[40, 40], [41, null], [null, 41], [null, 42], [42, 43]]);
  const split = splitRows(rows);
  expect(split[1].left.text).toBe("old");
  expect(split[1].right.text).toBe("new");
  expect(split[2].left).toBeNull();
  expect(split[2].right.newLine).toBe(42);
});

test("context expansion and whitespace filtering operate on complete source", () => {
  const base = Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
  const file = { path: "a.txt", baseContent: { text: base }, headContent: { text: base.replace("line 30", "  line 30  ") }, hunks: [] };
  expect(makeHunks(file, 3, false)[0].oldStart).toBe(27);
  expect(makeHunks(file, 23, false)[0].oldStart).toBe(7);
  expect(makeHunks(file, 3, true)).toHaveLength(0);
});

test("incremental diff includes changed, reverted and newly introduced files", () => {
  const file = (path, text) => ({ path, hunks: [], headContent: { text }, baseContent: { text: "original\n" } });
  const baseline = { files: [file("changed", "old\n"), file("reverted", "mistake\n"), file("same", "unchanged\n")] };
  const current = { files: [file("changed", "new\n"), file("same", "unchanged\n"), file("new", "added\n")], comparisonFiles: [file("reverted", "original\n")], comparisonBases: { a: { new: { text: "" } } } };
  const result = comparisonFiles(current, baseline, "a");
  expect(result.map((item) => item.path).sort()).toEqual(["changed", "new", "reverted"]);
  const reverted = result.find((item) => item.path === "reverted");
  expect(makeHunks(reverted, 3, false)[0].lines).toEqual(["-mistake", "+original"]);
  expect(result.find((item) => item.path === "new").baseContent.text).toBe("");
});

test("missing historic source reports unavailable instead of inventing a comparison", () => {
  const result = comparisonFiles({ files: [{ path: "new", baseContent: { text: "wrong merge base" }, headContent: { text: "new" }, hunks: [] }] }, { files: [] }, "a");
  expect(result[0].comparisonUnavailable).toBe(true);
});

test("renames compare against the previous path without a duplicate deletion", () => {
  const previous = { files: [{ path: "old.js", headContent: { text: "same\n" }, hunks: [] }] };
  const current = { files: [{ path: "new.js", oldPath: "old.js", headContent: { text: "same\n" }, hunks: [], status: "renamed" }] };
  const result = comparisonFiles(current, previous, "a");
  expect(result).toHaveLength(1);
  expect(result[0].path).toBe("new.js");
  expect(result[0].renamedSinceReview).toBe(true);
  expect(result[0].comparisonUnavailable).toBe(false);
});
