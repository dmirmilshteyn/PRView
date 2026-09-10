import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGitHubReviewService } from "../lib/github-review.js";
import { readReview, updateReview } from "../lib/review-store.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "prview-github-review-"));
  roots.push(cwd);
  const root = path.join(cwd, ".local-reviews");
  const folder = path.join(cwd, "artifacts/pr/23");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "details.json"), JSON.stringify({ repository: "owner/repo", number: 23, revision: "head", headSha: "head", baseSha: "base" }));
  await writeFile(path.join(folder, "diff.json"), JSON.stringify({ files: [{ path: "src/app.js" }] }));
  for (const [id, anchor] of [["file", null], ["line", { side: "RIGHT", start: 8, end: 8, revision: "head", excerpt: "code" }], ["range", { side: "LEFT", start: 2, end: 4, revision: "head", excerpt: "old code" }], ["resolved", null]]) {
    await updateReview(root, "owner/repo", 23, { type: "note", note: { id, filePath: "src/app.js", revision: "head", anchor, body: `Comment ${id}`, severity: "info", createdAt: "2026-09-09T00:00:00Z", resolved: false, replies: [] } });
  }
  await updateReview(root, "owner/repo", 23, { type: "reply", id: "line", reply: { id: "reply", body: "More context", createdAt: "2026-09-09T00:00:00Z" } });
  await updateReview(root, "owner/repo", 23, { type: "resolve", id: "resolved", resolved: true });
  const remote = { reviews: [], comments: [], calls: [], head: "head", failAfter: null, failBefore: null };
  async function api(method, endpoint, payload) {
    remote.calls.push({ method, endpoint, payload });
    if (method === "GET" && endpoint.includes("/comments?")) {
      return remote.comments;
    }
    if (method === "GET" && endpoint.includes("/reviews?")) {
      return remote.reviews;
    }
    if (method === "GET") {
      return { head: { sha: remote.head }, base: { sha: "base" } };
    }
    if (remote.failBefore === endpoint) {
      remote.failBefore = null;
      throw new Error("GitHub unavailable");
    }
    if (method === "DELETE") {
      remote.reviews = [];
      remote.comments = [];
      return {};
    }
    let result;
    if (endpoint === "graphql") {
      const input = payload.variables.input;
      remote.comments.push({ body: input.body, input });
      result = { data: { addPullRequestReviewThread: { thread: { id: "thread" } } } };
    } else if (endpoint.endsWith("/events")) {
      const review = remote.reviews.at(-1);
      review.state = { APPROVE: "APPROVED", COMMENT: "COMMENTED", REQUEST_CHANGES: "CHANGES_REQUESTED" }[payload.event];
      review.body = payload.body;
      result = { ...review };
    } else {
      result = { id: remote.reviews.length + 1, node_id: "REVIEW_NODE", body: payload.body, state: "PENDING", html_url: "https://github.com/owner/repo/pull/23#review" };
      remote.reviews.push(result);
    }
    if (remote.failAfter === endpoint) {
      remote.failAfter = null;
      throw new Error("Response lost");
    }
    return result;
  }
  const service = createGitHubReviewService(cwd, api);
  function operation(event, id) {
    return { type: "finalReview", review: { id, revision: "head", event, body: "Final feedback", source: "local", createdAt: "2026-09-09T00:00:00Z" } };
  }
  return { cwd, root, remote, api, service, operation };
}

test("all final actions submit a proper review with file, line, and multiline comments", async () => {
  for (const event of ["COMMENT", "REQUEST_CHANGES", "APPROVE"]) {
    const { root, remote, service, operation } = await fixture();
    const state = await service.submit("owner/repo", 23, operation(event, "review-1"));
    expect(state.reviews[0].github.status).toBe("submitted");
    expect(state.notes).toHaveLength(4);
    expect((await readReview(root, "owner/repo", 23)).reviews[0].event).toBe(event);
    expect(remote.comments).toHaveLength(3);
    expect(remote.comments[0].input).toMatchObject({ path: "src/app.js", subjectType: "FILE", pullRequestReviewId: "REVIEW_NODE" });
    expect(remote.comments[0].input.line).toBeUndefined();
    expect(remote.comments[1].input).toMatchObject({ line: 8, side: "RIGHT", subjectType: "LINE" });
    expect(remote.comments[1].body).toContain("More context");
    expect(remote.comments[1].input.startLine).toBeUndefined();
    expect(remote.comments[2].input).toMatchObject({ line: 4, side: "LEFT", startLine: 2, startSide: "LEFT" });
    expect(remote.calls.at(-1).payload.event).toBe(event);
    const count = remote.calls.length;
    await service.submit("owner/repo", 23, operation(event, "review-1"));
    expect(remote.calls).toHaveLength(count);
    await service.submit("owner/repo", 23, operation("COMMENT", "review-2"));
    expect(remote.comments).toHaveLength(3);
  }
});

test("lost responses resume the same pending review without duplicating comments or submissions, including after restart", async () => {
  for (const endpoint of ["repos/owner/repo/pulls/23/reviews", "graphql", "repos/owner/repo/pulls/23/reviews/1/events"]) {
    const { cwd, root, remote, api, service, operation } = await fixture();
    remote.failAfter = endpoint;
    await expect(service.submit("owner/repo", 23, operation("APPROVE", "review-1"))).rejects.toThrow("saved locally");
    expect((await readReview(root, "owner/repo", 23)).reviews[0].github.status).toBe("failed");
    const state = await createGitHubReviewService(cwd, api).submit("owner/repo", 23, operation("APPROVE", "review-1"));
    expect(state.reviews).toHaveLength(1);
    expect(state.reviews[0].github.status).toBe("submitted");
    expect(remote.reviews).toHaveLength(1);
    expect(remote.comments).toHaveLength(3);
    expect(remote.calls.filter((call) => call.endpoint.endsWith("/events"))).toHaveLength(1);
  }
});

test("GitHub failures retain local feedback and never mark an approval submitted", async () => {
  const { root, remote, service, operation } = await fixture();
  remote.failBefore = "repos/owner/repo/pulls/23/reviews/1/events";
  await expect(service.submit("owner/repo", 23, operation("APPROVE", "review-1"))).rejects.toThrow("saved locally");
  const state = await readReview(root, "owner/repo", 23);
  expect(state.reviews[0].body).toBe("Final feedback");
  expect(state.reviews[0].github.status).toBe("failed");
  expect(remote.reviews[0].state).toBe("PENDING");
  await service.submit("owner/repo", 23, operation("APPROVE", "review-1"));
  expect(remote.comments).toHaveLength(3);
});

test("stale heads and comparison anchors are rejected before any GitHub write", async () => {
  const first = await fixture();
  first.remote.head = "new-head";
  await expect(first.service.submit("owner/repo", 23, first.operation("APPROVE", "review-1"))).rejects.toThrow("changed on GitHub");
  expect(first.remote.calls.every((call) => call.method === "GET")).toBe(true);
  const second = await fixture();
  await updateReview(second.root, "owner/repo", 23, { type: "note", note: { id: "old", revision: "head", filePath: "src/app.js", anchor: { side: "LEFT", start: 1, end: 1, revision: "old-head", excerpt: "old" }, body: "Old comparison", severity: "info", resolved: false, replies: [], createdAt: "2026-09-09T00:00:00Z" } });
  await expect(second.service.submit("owner/repo", 23, second.operation("COMMENT", "review-1"))).rejects.toThrow("comparison snapshot");
  expect(second.remote.calls.every((call) => call.method === "GET")).toBe(true);
});

test("concurrent duplicate final submissions share one GitHub review", async () => {
  const { remote, service, operation } = await fixture();
  const op = operation("APPROVE", "review-1");
  await Promise.all([service.submit("owner/repo", 23, op), service.submit("owner/repo", 23, op)]);
  expect(remote.reviews).toHaveLength(1);
  expect(remote.comments).toHaveLength(3);
});

test("failed pending reviews can return to a draft, keeping notes available for the corrected review", async () => {
  const { root, remote, service, operation } = await fixture();
  remote.failBefore = "repos/owner/repo/pulls/23/reviews/1/events";
  await expect(service.submit("owner/repo", 23, operation("APPROVE", "review-1"))).rejects.toThrow();
  const state = await service.submit("owner/repo", 23, { type: "cancelReview", id: "review-1" });
  expect(remote.reviews).toHaveLength(0);
  expect(state.reviews[0].github.status).toBe("cancelled");
  expect(state.reviewDrafts.head).toEqual({ event: "APPROVE", body: "Final feedback" });
  expect((await readReview(root, "owner/repo", 23)).notes).toHaveLength(4);
  await service.submit("owner/repo", 23, operation("COMMENT", "review-2"));
  expect(remote.comments).toHaveLength(3);
});

test("returning to draft reconciles an already submitted review instead of deleting it", async () => {
  const { remote, service, operation } = await fixture();
  remote.failAfter = "repos/owner/repo/pulls/23/reviews/1/events";
  await expect(service.submit("owner/repo", 23, operation("APPROVE", "review-1"))).rejects.toThrow();
  const state = await service.submit("owner/repo", 23, { type: "cancelReview", id: "review-1" });
  expect(state.reviews[0].github.status).toBe("submitted");
  expect(remote.calls.some((call) => call.method === "DELETE")).toBe(false);
});
