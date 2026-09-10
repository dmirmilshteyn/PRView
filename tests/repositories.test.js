import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { repositoryArtifacts, readWorkspace, updateWorkspace } from "../lib/repositories.js";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "prview-repositories-"));
  roots.push(root);
  mkdirSync(path.join(root, "artifacts"));
  return root;
}

test("registered empty repositories never fall back to another repository's artifacts", () => {
  const root = fixture();
  writeFileSync(path.join(root, "artifacts/workspace.json"), JSON.stringify({ activeRepository: "owner/empty", repositories: ["owner/empty", "owner/other"] }));
  expect(repositoryArtifacts(root, "OWNER/EMPTY")).toBe(path.join(root, "artifacts/repos/owner/empty"));
  expect(repositoryArtifacts(root, "owner/other")).toBe(path.join(root, "artifacts/repos/owner/other"));
  expect(() => repositoryArtifacts(root, "../escape")).toThrow();
});

test("legacy imports infer their repository without changing files", () => {
  const root = fixture();
  mkdirSync(path.join(root, "artifacts/pr/42"), { recursive: true });
  writeFileSync(path.join(root, "artifacts/prs.json"), JSON.stringify({ yourChanges: [{ number: 42 }] }));
  writeFileSync(path.join(root, "artifacts/pr/42/details.json"), JSON.stringify({ repository: "owner/repo" }));
  expect(readWorkspace(root)).toEqual({ activeRepository: "owner/repo", repositories: ["owner/repo"] });
  expect(repositoryArtifacts(root, "owner/repo")).toBe(path.join(root, "artifacts"));
});

test("workspace actions use explicit repository CLI arguments and reject invalid input", async () => {
  const root = fixture();
  const calls = [];
  const runner = async (cwd, args) => { calls.push([cwd, args]); };
  await updateWorkspace(root, { action: "track", repository: "owner/repo", number: 42 }, runner);
  await updateWorkspace(root, { action: "register", repository: "owner/repo" }, runner);
  await updateWorkspace(root, { action: "select", repository: "owner/repo" }, runner);
  expect(calls).toEqual([[root, ["track", "owner/repo", "42"]], [root, ["repo", "track", "owner/repo"]], [root, ["repo", "use", "owner/repo"]]]);
  for (const input of [{ action: "track", repository: "owner/repo", number: 0 }, { action: "track", repository: "owner/repo", number: "42" }, { action: "register", repository: "../bad" }]) {
    await expect(updateWorkspace(root, input, runner)).rejects.toThrow();
  }
  expect(calls.length).toBe(3);
});
