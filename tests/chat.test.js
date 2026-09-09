import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chatKey, createChatStore } from "../lib/chat-store.js";
import { createChatService, reviewChatMetadata } from "../lib/chat-service.js";

test("chat context keeps code discussion without check or reviewer status", () => {
  const metadata = reviewChatMetadata({
    number: 1, title: "Fix parsing", body: "Handle empty input", headSha: "abc",
    checks: "failure", checkRuns: [{ conclusion: "failure" }], status: "approved",
    reviewers: ["alice"], reviewRequests: ["bob"], reviewDecision: "APPROVED",
    reviewHistory: [{ state: "APPROVED" }], stack: { entries: [{ checks: "success" }] },
    github: { reviews: [{ id: 2, body: "Add an empty input test", state: "CHANGES_REQUESTED", user: { login: "alice" } }, { body: "", state: "APPROVED" }], inlineComments: [{ id: 3, body: "Guard here", path: "parser.js", line: 7, side: "RIGHT" }] },
  });
  expect(metadata).toEqual({ number: 1, title: "Fix parsing", body: "Handle empty input", headSha: "abc", discussion: [
    { id: 2, body: "Add an empty input test" },
    { id: 3, body: "Guard here", path: "parser.js", line: 7, side: "RIGHT" },
  ] });
});

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function store() {
  const root = await mkdtemp(path.join(os.tmpdir(), "prview-chat-"));
  roots.push(root);
  return createChatStore(root);
}
async function finish(service, key) {
  for (let index = 0; index < 100; index += 1) {
    const state = await service.get(key);
    if (state.status !== "running") {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Chat did not finish");
}

test("chat persists transcript and resumes its exact session after service restart", async () => {
  const disk = await store();
  const key = chatKey("owner/repo", 1);
  const sessionId = randomUUID();
  const calls = [];
  const runner = async (input) => {
    calls.push(input.sessionId);
    await input.onEvent({ type: "thread.started", thread_id: sessionId });
    await input.onEvent({ type: "item.completed", item: { type: "agent_message", text: "Review response" } });
  };
  const first = createChatService(disk, runner);
  await first.send(key, "Review this PR", randomUUID(), "PR context", "revision-a", "/tmp");
  expect((await finish(first, key)).sessionId).toBe(sessionId);
  const second = createChatService(disk, runner);
  await second.send(key, "What about tests?", randomUUID(), "Updated context", "revision-b", "/tmp");
  const saved = await finish(second, key);
  expect(calls).toEqual([null, sessionId]);
  expect(saved.messages.map((item) => item.role)).toEqual(["user", "assistant", "user", "assistant"]);
  expect(saved.contextRevision).toBe("revision-b");
  expect((await second.get(chatKey("other/repo", 1))).messages).toEqual([]);
  expect((await second.get(chatKey("owner/repo", 2))).sessionId).toBeNull();
});

test("duplicate submissions are idempotent and concurrent turns are rejected", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const service = createChatService(await store(), async ({ onEvent }) => {
    await gate;
    await onEvent({ type: "item.completed", item: { type: "agent_message", text: "Done" } });
  });
  const key = chatKey("owner/repo", 1);
  const id = randomUUID();
  await service.send(key, "First", id, "context", "a", "/tmp");
  expect((await service.send(key, "First", id, "context", "a", "/tmp")).messages).toHaveLength(1);
  await expect(service.send(key, "Second", randomUUID(), "context", "a", "/tmp")).rejects.toThrow("already responding");
  release();
  expect((await finish(service, key)).messages).toHaveLength(2);
});

test("failed and interrupted turns preserve the session and surface errors", async () => {
  const disk = await store();
  const key = chatKey("owner/repo", 1);
  const sessionId = randomUUID();
  const service = createChatService(disk, async ({ onEvent }) => {
    await onEvent({ type: "thread.started", thread_id: sessionId });
    throw new Error("Authentication expired");
  });
  await service.send(key, "Review", randomUUID(), "context", "a", "/tmp");
  const saved = await finish(service, key);
  expect(saved.error).toBe("Authentication expired");
  expect(saved.sessionId).toBe(sessionId);
  await disk.update(key, (state) => ({ ...state, status: "running" }));
  expect((await createChatService(disk, async () => {}).get(key)).error).toContain("interrupted");
  expect(() => chatKey("../repo", 1)).toThrow();
  await expect(service.send(key, " ", randomUUID(), "context", "a", "/tmp")).rejects.toThrow("message");
});
