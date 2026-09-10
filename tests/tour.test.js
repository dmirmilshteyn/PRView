import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chatKey } from "../lib/chat-store.js";
import { tourInput, tourFingerprint, tourLines, tourPrompt, validateTour } from "../lib/tour.js";
import { createTourStore } from "../lib/tour-store.js";
import { createTourService } from "../lib/tour-service.js";

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
function input() {
  return tourInput({ repository: "owner/repo", number: 23, revision: "abc", baseSha: "def", title: "Guard input", body: "Handle empty input", checks: "failure", reviewers: ["alice"] }, { files: [
    { path: "src/parser.js", status: "modified", headContent: { text: "function parse(input) {\n  return input || [];\n}\n" }, baseContent: { text: "function parse(input) {\n  return input;\n}\n" }, hunks: [] },
    { path: "lockfile", status: "modified", hunks: [] },
  ] });
}
function tour() {
  return { preparation: { summary: "The parser return contract changes for empty input.", areas: [{ title: "Caller expectations", context: "Callers previously received the original input.", whyItMatters: "An array fallback changes how callers interpret missing values." }] }, title: "Follow the empty-input path", overview: "Empty input now returns an array.", flow: "Input passes through src/parser.js.", steps: [{ title: "Guard behavior", risk: "medium", why: "Changes the return contract", explanation: "The fallback returns an empty array.", references: [{ path: "src/parser.js", side: "RIGHT", start: 1, end: 3 }], questions: ["Should false also become an array?"] }], mechanical: [], existingTests: [], suggestedTests: ["Pass false and check the expected contract"], notCovered: [], limitations: ["Tests were not supplied"] };
}
async function setup(runner) {
  const root = await mkdtemp(path.join(os.tmpdir(), "prview-tour-"));
  roots.push(root);
  const store = createTourStore(root);
  const source = input();
  const key = `${chatKey(source.repository, source.number)}/${tourFingerprint(source)}`;
  return { root, store, key, source, service: createTourService(store, runner, root) };
}
async function finish(service, key) {
  for (let index = 0; index < 100; index += 1) {
    const state = await service.get(key);
    if (state.status !== "running") {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Tour did not finish");
}

test("tour identities track code and base changes while excluding CI and reviewers", () => {
  const source = input();
  const fingerprint = tourFingerprint(source);
  expect(source.checks).toBeUndefined();
  expect(source.reviewers).toBeUndefined();
  expect(tourFingerprint({ ...source, checks: "success", syncedAt: "later", title: "Edited title" })).toBe(fingerprint);
  expect(tourFingerprint({ ...source, baseSha: "changed" })).not.toBe(fingerprint);
  expect(tourFingerprint({ ...source, revision: "changed" })).not.toBe(fingerprint);
  expect(tourFingerprint({ ...source, files: [] })).not.toBe(fingerprint);
  expect(tourFingerprint({ ...source, repository: "other/repo" })).not.toBe(fingerprint);
  expect(tourFingerprint({ ...source, number: 24 })).not.toBe(fingerprint);
  expect(tourFingerprint({ ...source, version: 2 })).not.toBe(fingerprint);
  expect(tourPrompt(source, "/tmp/snapshot.json")).toContain("immutable source of truth");
});

test("tour references are grounded in source and uncovered files remain explicit", () => {
  const result = validateTour(JSON.stringify(tour()), input());
  expect(result.steps[0].references[0].excerpt).toContain("return input || [];");
  expect(result.coveredCount).toBe(1);
  expect(result.fileCount).toBe(2);
  expect(result.notCovered[0].path).toBe("lockfile");
  for (const reference of [{ path: "unknown", side: "RIGHT", start: 1, end: 2 }, { path: "src/parser.js", side: "RIGHT", start: 1, end: 99 }]) {
    const invalid = tour();
    invalid.steps[0].references = [reference];
    expect(() => validateTour(JSON.stringify(invalid), input())).toThrow();
  }
  const patch = { hunks: [{ header: "@@ -7,2 +8,2 @@", lines: [" context", "-old", "+new"] }] };
  expect([...tourLines(patch, "LEFT")]).toEqual([[7, "context"], [8, "old"]]);
  expect([...tourLines(patch, "RIGHT")]).toEqual([[8, "context"], [9, "new"]]);
});

test("preparation guide is preserved and requires bounded, complete risk areas", () => {
  const value = tour();
  expect(validateTour(JSON.stringify(value), input()).preparation).toEqual(value.preparation);
  value.preparation = { summary: "No material high-risk area is evident in this snapshot.", areas: [] };
  expect(validateTour(JSON.stringify(value), input()).preparation.areas).toEqual([]);
  for (const preparation of [undefined, { summary: "Summary", areas: Array(5).fill({}) }, { summary: "Summary", areas: [{ title: "Area" }] }]) {
    expect(() => validateTour(JSON.stringify({ ...value, preparation }), input())).toThrow();
  }
  expect(tourFingerprint({ ...input(), version: 3 })).not.toBe(tourFingerprint(input()));
});

test("generation is deduplicated and completed tours survive service restarts", async () => {
  let calls = 0;
  const runner = async ({ onEvent, sessionId }) => {
    calls += 1;
    expect(sessionId).toBeNull();
    await onEvent({ type: "thread.started", thread_id: "tour-session" });
    await onEvent({ type: "item.completed", item: { type: "agent_message", text: "Reading the snapshot" } });
    await onEvent({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(tour()) } });
  };
  const { store, service, root, key, source } = await setup(runner);
  await Promise.all([service.generate(key, source, false), service.generate(key, source, false)]);
  const saved = await finish(service, key);
  expect(saved.status).toBe("ready");
  expect(saved.sessionId).toBe("tour-session");
  const restarted = createTourService(store, runner, root);
  expect((await restarted.generate(key, source, false)).generatedAt).toBe(saved.generatedAt);
  expect(calls).toBe(1);
  await expect(store.read("../../outside")).rejects.toThrow("Invalid tour key");
});

test("invalid output and interrupted generation can be explicitly retried", async () => {
  let valid = false;
  const runner = async ({ onEvent }) => { await onEvent({ type: "item.completed", item: { type: "agent_message", text: valid ? JSON.stringify(tour()) : "not JSON" } }); };
  const { service, store, key, source } = await setup(runner);
  await service.generate(key, source, false);
  expect((await finish(service, key)).status).toBe("error");
  expect((await service.generate(key, source, false)).status).toBe("error");
  valid = true;
  await service.generate(key, source, true);
  expect((await finish(service, key)).status).toBe("ready");
  await store.update(key, (state) => ({ ...state, status: "running" }));
  expect((await service.get(key)).error).toContain("interrupted");
});


test("mechanical work is validated separately, including mechanical-only tours", () => {
  const value = tour();
  value.mechanical = [{ ...value.steps[0], title: "Forward the parser prop", risk: "low" }];
  let result = validateTour(JSON.stringify(value), input());
  expect(result.steps).toHaveLength(1);
  expect(result.mechanical).toHaveLength(1);
  expect(result.mechanical[0].references[0].excerpt).toContain("return input");
  value.steps = [];
  result = validateTour(JSON.stringify(value), input());
  expect(result.steps).toHaveLength(0);
  expect(result.mechanical).toHaveLength(1);
  value.mechanical[0].references[0].path = "missing.js";
  expect(() => validateTour(JSON.stringify(value), input())).toThrow("invalid code reference");
  expect(tourFingerprint({ ...input(), version: 1 })).not.toBe(tourFingerprint(input()));
});

test("tour review progress persists, merges concurrent sections, and stays snapshot scoped", async () => {
  const runner = async ({ onEvent }) => { await onEvent({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(tour()) } }); };
  const { service, store, root, key, source } = await setup(runner);
  await service.generate(key, source, false);
  const original = await finish(service, key);
  await Promise.all([service.markReviewed(key, "overview", true), service.markReviewed(key, "step-1", true)]);
  const restarted = createTourService(store, runner, root);
  const saved = await restarted.get(key);
  expect(Object.keys(saved.reviewedSections).sort()).toEqual(["overview", "step-1"]);
  expect(saved.generatedAt).toBe(original.generatedAt);
  expect(saved.tour).toEqual(original.tour);
  await restarted.markReviewed(key, "overview", false);
  expect(Object.keys((await store.read(key)).reviewedSections)).toEqual(["step-1"]);
  const otherKey = key.replace(/[^/]+$/, "d".repeat(64));
  expect((await restarted.get(otherKey)).reviewedSections).toBeUndefined();
  await expect(restarted.markReviewed(key, "step-999", true)).rejects.toThrow("Unknown");
  await expect(restarted.markReviewed(key, "mechanical", true)).rejects.toThrow("Unknown");
  await expect(restarted.markReviewed(key, "overview", "yes")).rejects.toThrow("required");
  await expect(restarted.markReviewed(otherKey, "overview", true)).rejects.toThrow("Generate");
});
