import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPRReviewerService } from "../lib/pr-reviewers.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(ownerType) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "prview-reviewers-"));
  roots.push(cwd);
  await mkdir(path.join(cwd, "artifacts/pr/23"), { recursive: true });
  await writeFile(path.join(cwd, "artifacts/pr/23/details.json"), JSON.stringify({ repository: "owner/repo" }));
  const data = {
    calls: [],
    members: [{ login: "org-member", type: "User" }, { login: "overlap", type: "User" }, { login: "author", type: "User" }, { login: "robot", type: "Bot" }],
    collaborators: [{ login: "repo-collaborator", type: "User" }, { login: "overlap", type: "User" }],
    requested: [{ login: "already-requested" }],
    denied: false,
  };
  const service = createPRReviewerService(cwd, async (method, endpoint, payload) => {
    data.calls.push({ method, endpoint, payload });
    if (method === "POST") {
      data.requested.push({ login: payload.reviewers[0] });
      return { requested_reviewers: data.requested, requested_teams: [{ name: "Core", slug: "core" }] };
    }
    if (endpoint === "repos/owner/repo") {
      return { owner: { type: ownerType, login: "owner" } };
    }
    if (endpoint === "repos/owner/repo/pulls/23") {
      return { user: { login: "author" }, requested_reviewers: data.requested, requested_teams: [{ name: "Core", slug: "core" }] };
    }
    if (data.denied) {
      throw new Error("Membership access denied");
    }
    const source = endpoint.startsWith("orgs/") ? data.members : data.collaborators;
    const page = Number(new URL(`https://api.github.com/${endpoint}`).searchParams.get("page"));
    return source.slice((page - 1) * 100, page * 100);
  });
  return { service, data };
}

test("suggestions include only org members or repo collaborators, excluding authors and bots", async () => {
  const { service } = await fixture("Organization");
  const result = await service.list("owner/repo", 23);
  expect(result.users.map((user) => user.login)).toEqual(["org-member", "overlap", "repo-collaborator"]);
});

test("personal repos use only collaborators and never query an organization", async () => {
  const { service, data } = await fixture("User");
  expect((await service.list("owner/repo", 23)).users.map((user) => user.login)).toEqual(["overlap", "repo-collaborator"]);
  expect(data.calls.some((call) => call.endpoint.startsWith("orgs/"))).toBe(false);
});

test("all membership pages are fetched before filtering candidates", async () => {
  const { service, data } = await fixture("Organization");
  data.members = Array.from({ length: 101 }, (_, index) => ({ login: `member-${index}`, type: "User" }));
  expect((await service.list("owner/repo", 23)).users.some((user) => user.login === "member-100")).toBe(true);
});

test("external, removed, author and bot users cannot be submitted, including tampered requests", async () => {
  const { service, data } = await fixture("Organization");
  await service.list("owner/repo", 23);
  data.members = data.members.filter((user) => user.login !== "org-member");
  for (const login of ["external-user", "org-member", "author", "robot"]) {
    await expect(service.request("owner/repo", 23, login)).rejects.toThrow("not an eligible");
  }
  expect(data.calls.some((call) => call.method === "POST")).toBe(false);
});

test("review requests preserve existing reviewers and teams and are safe to retry", async () => {
  const { service, data } = await fixture("Organization");
  const result = await service.request("owner/repo", 23, "ORG-MEMBER");
  expect(result.reviewRequests).toEqual([{ login: "already-requested" }, { login: "org-member" }, { name: "Core", slug: "core" }]);
  expect(data.calls.at(-1)).toEqual({ method: "POST", endpoint: "repos/owner/repo/pulls/23/requested_reviewers", payload: { reviewers: ["org-member"] } });
  await service.request("owner/repo", 23, "org-member");
  expect(data.calls.filter((call) => call.method === "POST")).toHaveLength(1);
});

test("membership failures and mismatched repos fail closed", async () => {
  const { service, data } = await fixture("Organization");
  await expect(service.list("../repo", 23)).rejects.toThrow("required");
  await expect(service.list("other/repo", 23)).rejects.toThrow("does not match");
  expect(data.calls).toHaveLength(0);
  data.denied = true;
  await expect(service.request("owner/repo", 23, "org-member")).rejects.toThrow("access denied");
  expect(data.calls.some((call) => call.method === "POST")).toBe(false);
});
