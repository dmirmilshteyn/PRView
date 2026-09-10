import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGitHubThreadService } from "../lib/github-thread.js";

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(api) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "prview-thread-"));
  roots.push(cwd);
  await mkdir(path.join(cwd, "artifacts/pr/23"), { recursive: true });
  await writeFile(path.join(cwd, "artifacts/pr/23/details.json"), JSON.stringify({ repository: "owner/repo", github: { inlineComments: [{ id: 10 }, { id: 11, in_reply_to_id: 10 }], threads: [{ id: "thread", comments: { nodes: [{ databaseId: 10 }] } }] } }));
  return createGitHubThreadService(cwd, api);
}
function input(action) {
  return { repository: "owner/repo", number: 23, commentId: 10, action, body: "Thanks, fixed this.", requestId: "12345678-1234-1234-1234-123456789012" };
}
function node(resolved) {
  return { id: "thread", isResolved: resolved, viewerCanResolve: true, viewerCanUnresolve: true, pullRequest: { number: 23, repository: { nameWithOwner: "owner/repo" } } };
}

test("replies target the original inline thread and reconcile a lost response", async () => {
  const comments = [];
  let posts = 0;
  const service = await fixture(async (method, endpoint, payload) => {
    if (endpoint === "user") {
      return { login: "me" };
    }
    if (method === "GET") {
      expect(endpoint).toBe("repos/owner/repo/pulls/23/comments?per_page=100&page=1");
      return comments;
    }
    expect(endpoint).toBe("repos/owner/repo/pulls/23/comments/10/replies");
    posts += 1;
    comments.push({ id: 12, in_reply_to_id: 10, body: payload.body, user: { login: "me" } });
    throw new Error("Response lost");
  });
  await expect(service.act(input("reply"))).rejects.toThrow("Response lost");
  const result = await service.act(input("reply"));
  expect(result.comment.id).toBe(12);
  expect(result.comment.body).toContain("Thanks, fixed this.");
  expect(posts).toBe(1);
});

test("simultaneous duplicate requests create one reply", async () => {
  let posts = 0;
  const service = await fixture(async (method, endpoint, payload) => {
    if (endpoint === "user") {
      return { login: "me" };
    }
    if (method === "GET") {
      return [];
    }
    posts += 1;
    return { id: 12, in_reply_to_id: 10, body: payload.body };
  });
  const [first, second] = await Promise.all([service.act(input("reply")), service.act(input("reply"))]);
  expect(first).toEqual(second);
  expect(posts).toBe(1);
});

test("invalid input, foreign repositories, and non-root comments never reach GitHub", async () => {
  const service = await fixture(async () => { throw new Error("Unexpected network call"); });
  for (const change of [{ repository: "other/repo" }, { commentId: 11 }, { commentId: 99 }, { body: " " }, { action: "delete" }, { repository: "../repo" }]) {
    await expect(service.act({ ...input("reply"), ...change })).rejects.not.toThrow("Unexpected network call");
  }
});

test("resolve and unresolve verify membership and use dedicated GraphQL mutations", async () => {
  for (const action of ["resolve", "unresolve"]) {
    const resolved = action === "resolve";
    let mutations = 0;
    const service = await fixture(async (method, endpoint, payload) => {
      expect(endpoint).toBe("graphql");
      if (payload.query.startsWith("query")) {
        return { data: { node: node(!resolved) } };
      }
      mutations += 1;
      const mutation = resolved ? "resolveReviewThread" : "unresolveReviewThread";
      expect(payload.query).toContain(mutation);
      expect(payload.variables).toEqual({ id: "thread" });
      return { data: { [mutation]: { thread: { id: "thread", isResolved: resolved } } } };
    });
    expect((await service.act(input(action))).thread.isResolved).toBe(resolved);
    expect(mutations).toBe(1);
  }
});

test("foreign threads and denied permissions cannot be resolved", async () => {
  for (const thread of [{ ...node(false), viewerCanResolve: false }, { ...node(false), pullRequest: { number: 99, repository: { nameWithOwner: "owner/repo" } } }]) {
    let mutations = 0;
    const service = await fixture(async (method, endpoint, payload) => {
      if (payload.query.startsWith("mutation")) {
        mutations += 1;
      }
      return { data: { node: thread } };
    });
    await expect(service.act(input("resolve"))).rejects.toThrow();
    expect(mutations).toBe(0);
  }
});

test("retrying an already resolved thread avoids a redundant mutation", async () => {
  let calls = 0;
  const service = await fixture(async () => { calls += 1; return { data: { node: node(true) } }; });
  expect((await service.act(input("resolve"))).thread.isResolved).toBe(true);
  expect(calls).toBe(1);
});
