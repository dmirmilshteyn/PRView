import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPRAssignmentService } from "../lib/pr-assignment.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function workspace() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "prview-assignment-"));
  roots.push(cwd);
  await mkdir(path.join(cwd, "artifacts/pr/23"), { recursive: true });
  await writeFile(path.join(cwd, "artifacts/pr/23/details.json"), JSON.stringify({ repository: "owner/repo", number: 23 }));
  return cwd;
}

test("self-assignment uses the authenticated user and adds to existing assignees", async () => {
  const calls = [];
  const assignees = new Set(["teammate"]);
  const service = createPRAssignmentService(await workspace(), async (method, endpoint, payload) => {
    calls.push({ method, endpoint, payload });
    if (endpoint === "user") {
      return { login: "current-user" };
    }
    for (const login of payload.assignees) {
      assignees.add(login);
    }
    return { assignees: [...assignees].map((login) => ({ login })) };
  });
  expect(await service.assignSelf("Owner/Repo", 23)).toEqual({ login: "current-user", assignees: ["teammate", "current-user"] });
  expect(calls).toEqual([
    { method: "GET", endpoint: "user", payload: null },
    { method: "POST", endpoint: "repos/owner/repo/issues/23/assignees", payload: { assignees: ["current-user"] } },
  ]);
  expect((await service.assignSelf("owner/repo", 23)).assignees).toEqual(["teammate", "current-user"]);
});

test("invalid and mismatched PRs are rejected before contacting GitHub", async () => {
  const calls = [];
  const service = createPRAssignmentService(await workspace(), async (...args) => { calls.push(args); });
  await expect(service.assignSelf("../repo", 23)).rejects.toThrow("required");
  await expect(service.assignSelf("owner/repo", "23")).rejects.toThrow("required");
  await expect(service.assignSelf("other/repo", 23)).rejects.toThrow("does not match");
  expect(calls).toHaveLength(0);
});

test("missing permissions or identity never report a successful assignment", async () => {
  const cwd = await workspace();
  const denied = createPRAssignmentService(cwd, async (method, endpoint) => endpoint === "user" ? { login: "current-user" } : { assignees: [{ login: "teammate" }] });
  await expect(denied.assignSelf("owner/repo", 23)).rejects.toThrow("permissions");
  const unauthenticated = createPRAssignmentService(cwd, async () => { throw new Error("Authentication required"); });
  await expect(unauthenticated.assignSelf("owner/repo", 23)).rejects.toThrow("Authentication required");
});
