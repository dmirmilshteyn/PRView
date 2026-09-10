import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAutoMergeService } from "../lib/auto-merge.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function setup(enabled, allowed) {
  const root = await mkdtemp(path.join(os.tmpdir(), "prview-auto-merge-"));
  roots.push(root);
  await mkdir(path.join(root, "artifacts/pr/23"), { recursive: true });
  await writeFile(path.join(root, "artifacts/pr/23/details.json"), JSON.stringify({ repository: "owner/repo" }));
  const calls = [];
  const service = createAutoMergeService(root, async (query, variables) => {
    calls.push({ query, variables });
    if (query.startsWith("query")) {
      return { repository: {
        autoMergeAllowed: allowed, squashMergeAllowed: true, mergeCommitAllowed: false, rebaseMergeAllowed: true,
        pullRequest: { id: "PR_23", state: "OPEN", isDraft: false, viewerCanEnableAutoMerge: allowed, viewerCanDisableAutoMerge: allowed,
          autoMergeRequest: enabled ? { mergeMethod: "REBASE" } : null },
      } };
    }
    const operation = enabled ? "disablePullRequestAutoMerge" : "enablePullRequestAutoMerge";
    return { [operation]: { pullRequest: { autoMergeRequest: enabled ? null : { mergeMethod: variables.method } } } };
  });
  return { service, calls };
}

test("enables with the selected supported method and disables existing auto-merge", async () => {
  for (const enabled of [false, true]) {
    const { service, calls } = await setup(enabled, true);
    const result = await service.update("owner/repo", 23, !enabled, "SQUASH");
    expect(result.enabled).toBe(!enabled);
    expect(calls[1].variables).toEqual(enabled ? { id: "PR_23" } : { id: "PR_23", method: "SQUASH" });
    expect(calls[1].query).toContain(enabled ? "disablePullRequestAutoMerge" : "enablePullRequestAutoMerge");
  }
});

test("rejects invalid and mismatched imported PRs before contacting GitHub", async () => {
  const { service, calls } = await setup(false, true);
  await expect(service.read("../repo", 23)).rejects.toThrow("required");
  await expect(service.read("owner/repo", -1)).rejects.toThrow("required");
  await expect(service.read("other/repo", 23)).rejects.toThrow("does not match");
  await expect(service.update("owner/repo", 23, "true", "SQUASH")).rejects.toThrow("boolean");
  expect(calls).toHaveLength(0);
});

test("does not mutate when unavailable, unsupported, or already in the requested state", async () => {
  const denied = await setup(false, false);
  await expect(denied.service.update("owner/repo", 23, true, "SQUASH")).rejects.toThrow("does not allow");
  expect(denied.calls).toHaveLength(1);
  const allowed = await setup(false, true);
  await expect(allowed.service.update("owner/repo", 23, true, "MERGE")).rejects.toThrow("does not allow");
  expect(allowed.calls).toHaveLength(1);
  const result = await allowed.service.update("owner/repo", 23, false, null);
  expect(result.enabled).toBe(false);
  expect(allowed.calls).toHaveLength(2);
});
