import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCIService } from "../lib/ci-status.js";
import { hasPendingChecks, summarizeChecks } from "../src/review/ci-status.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("polling continues for every unfinished state, including alongside failures", () => {
  for (const status of ["QUEUED", "IN_PROGRESS", "WAITING", "PENDING", "REQUESTED"]) {
    expect(hasPendingChecks([{ status: "COMPLETED", conclusion: "FAILURE" }, { status }])).toBe(true);
  }
  expect(hasPendingChecks([{ state: "PENDING" }])).toBe(true);
  expect(hasPendingChecks([{ state: "EXPECTED" }])).toBe(true);
  expect(hasPendingChecks([{}])).toBe(true);
});

test("polling stops for completed checks, terminal legacy statuses, and empty rollups", () => {
  const checkRuns = ["SUCCESS", "FAILURE", "CANCELLED", "TIMED_OUT", "NEUTRAL", "SKIPPED", "ACTION_REQUIRED"].map((conclusion) => ({ status: "COMPLETED", conclusion }));
  expect(hasPendingChecks(checkRuns)).toBe(false);
  expect(hasPendingChecks([{ state: "SUCCESS" }, { state: "FAILURE" }, { state: "ERROR" }])).toBe(false);
  expect(hasPendingChecks([])).toBe(false);
  expect(summarizeChecks([{ status: "IN_PROGRESS" }])).toBe("1 check pending");
  expect(summarizeChecks([{ state: "FAILURE" }, { state: "PENDING" }])).toBe("1 check failing");
  expect(summarizeChecks([{ status: "COMPLETED", conclusion: "SUCCESS" }])).toBe("All checks passed");
  expect(summarizeChecks([])).toBe("No checks reported");
});

test("CI reads target only the imported PR and leave synced artifacts unchanged", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "prview-ci-"));
  roots.push(root);
  const folder = path.join(root, "artifacts/pr/23");
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, "details.json");
  const original = JSON.stringify({ repository: "owner/repo", checkRuns: [{ status: "QUEUED" }], body: "Description" });
  await writeFile(file, original);
  const calls = [];
  const checks = [{ status: "COMPLETED", conclusion: "SUCCESS" }];
  const service = createCIService(root, async (...args) => { calls.push(args); return checks; });
  await expect(service.read("../repo", 23)).rejects.toThrow("required");
  await expect(service.read("owner/repo", -1)).rejects.toThrow("required");
  await expect(service.read("other/repo", 23)).rejects.toThrow("does not match");
  expect(calls).toEqual([]);
  expect(await service.read("Owner/Repo", 23)).toEqual({ checkRuns: checks });
  expect(calls).toEqual([["owner/repo", 23]]);
  expect(await readFile(file, "utf8")).toBe(original);
});
