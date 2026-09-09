import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRefreshService } from "../lib/refresh.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function workspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "prview-refresh-"));
  roots.push(root);
  for (const number of [23, 24]) {
    const folder = path.join(root, "artifacts", "pr", String(number));
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "details.json"), JSON.stringify({ repository: "owner/repo", number }));
  }
  return root;
}

test("refresh only runs for a matching imported PR", async () => {
  const root = await workspace();
  const calls = [];
  const service = createRefreshService(root, async (...args) => { calls.push(args); });
  await expect(service.refresh("other/repo", 23)).rejects.toThrow("does not match");
  await expect(service.refresh("../repo", 23)).rejects.toThrow("required");
  await expect(service.refresh("owner/repo", "../23")).rejects.toThrow("required");
  await expect(service.refresh("owner/repo", 999)).rejects.toThrow();
  expect(calls).toEqual([]);
  await service.refresh("Owner/Repo", 23);
  expect(calls).toEqual([["owner/repo", 23, root]]);
});

test("refresh shares duplicate requests and prevents concurrent dashboard writes", async () => {
  let release;
  let started;
  const gate = new Promise((resolve) => { release = resolve; });
  const running = new Promise((resolve) => { started = resolve; });
  let calls = 0;
  const service = createRefreshService(await workspace(), async () => { calls += 1; started(); await gate; });
  const first = service.refresh("owner/repo", 23);
  await running;
  const second = service.refresh("owner/repo", 23);
  await expect(service.refresh("owner/repo", 24)).rejects.toThrow("Another PR is refreshing");
  release();
  await Promise.all([first, second]);
  expect(calls).toBe(1);
  await service.refresh("owner/repo", 24);
  expect(calls).toBe(2);
});

test("a failed refresh surfaces its error and allows retry", async () => {
  let calls = 0;
  const service = createRefreshService(await workspace(), async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error("GitHub authentication expired");
    }
  });
  await expect(service.refresh("owner/repo", 23)).rejects.toThrow("authentication expired");
  await service.refresh("owner/repo", 23);
  expect(calls).toBe(2);
});
