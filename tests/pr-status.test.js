import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPRStatusService, parseGitHubResponse } from "../lib/pr-status.js";
const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(checks) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "prview-status-")); roots.push(cwd);
  await mkdir(path.join(cwd, "artifacts/pr/23"), { recursive: true });
  await writeFile(path.join(cwd, "artifacts/pr/23/details.json"), JSON.stringify({ repository: "owner/repo", headSha: "head", checkRuns: checks }));
  return cwd;
}
function response() {
  return { status: 200, headers: { etag: '"v1"' }, data: { state: "open", merged: false, draft: false, mergeable: false, mergeable_state: "dirty", head: { sha: "head" }, assignees: [{ login: "me" }], requested_reviewers: [{ login: "reviewer" }], requested_teams: [] } };
}
test("conditional responses parse ETags and empty 304 bodies", () => {
  expect(parseGitHubResponse('HTTP/2.0 304 Not Modified\r\nETag: "v1"\r\n\r\n')).toEqual({ status: 304, headers: { etag: '"v1"' }, data: null });
});
test("multiple views share one cached request and completed CI is not fetched again", async () => {
  let time = 100000; let calls = 0; let ciCalls = 0; const tags = [];
  const service = createPRStatusService(await fixture([{ status: "IN_PROGRESS" }]), async (repo, number, etag) => {
    calls += 1; tags.push(etag); return calls === 1 ? response() : { status: 304, headers: {}, data: null };
  }, async () => { ciCalls += 1; return [{ status: "COMPLETED", conclusion: "SUCCESS" }]; }, () => time);
  const [a, b] = await Promise.all([service.read("owner/repo", 23), service.read("owner/repo", 23)]);
  expect(a).toEqual(b); expect(a.mergeConflict).toBe(true); expect(a.reviewRequests).toEqual([{ login: "reviewer" }]);
  expect(calls).toBe(1); expect(ciCalls).toBe(1);
  await service.read("owner/repo", 23); expect(calls).toBe(1);
  time += 60000; await service.read("owner/repo", 23);
  expect(tags).toEqual([null, '"v1"']); expect(ciCalls).toBe(1);
});
test("rate limits back off shared requests and preserve the last known status", async () => {
  let time = 100000; let calls = 0;
  const service = createPRStatusService(await fixture([]), async () => {
    calls += 1; return calls === 1 ? response() : { status: 429, headers: { "retry-after": "600" }, data: null };
  }, async () => [], () => time);
  await service.read("owner/repo", 23); time += 60000;
  const result = await service.read("owner/repo", 23);
  expect(result.liveState).toBe("OPEN"); expect(result.pollAfterMs).toBe(600000); expect(result.warning).toContain("backing off");
  time += 60000; await service.read("owner/repo", 23); expect(calls).toBe(2);
});
test("closed PRs poll less frequently and never fetch CI", async () => {
  let time = 100000; let calls = 0;
  const service = createPRStatusService(await fixture([{ state: "PENDING" }]), async () => { calls += 1; const value = response(); value.data.merged = true; return value; }, async () => { throw new Error("Unexpected CI call"); }, () => time);
  expect((await service.read("owner/repo", 23)).pollAfterMs).toBe(300000);
  time += 60000; await service.read("owner/repo", 23); expect(calls).toBe(1);
});
