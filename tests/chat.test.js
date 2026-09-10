import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chatKey, createChatStore } from "../lib/chat-store.js";
import { createChatService, createChatServiceWithRuntime, reviewChatMetadata } from "../lib/chat-service.js";
import { validateChatAttachments } from "../lib/chat-attachments.js";
import { buildChatPrompt } from "../lib/chat-prompt.js";

test("code selections with and without comments preserve ranges in the prompt and saved session", async () => {
  const disk = await store();
  const key = chatKey("owner/repo", 1);
  const attachments = ["LEFT", "RIGHT"].map((side) => ({ id: randomUUID(), filePath: "src/parser.js", revision: "head", body: side === "LEFT" ? `Question about ${side}` : "", anchor: { side, start: 4, end: 6, excerpt: "const value = parse(input);\nreturn value;", revision: side === "LEFT" ? "base" : "head" } }));
  const prompts = [];
  const runner = async ({ prompt, onEvent }) => {
    prompts.push(prompt);
    await onEvent({ type: "item.completed", item: { type: "agent_message", text: "Answer" } });
  };
  const service = createChatService(disk, runner);
  const id = randomUUID();
  await service.send(key, "Compare these blocks", id, "context", "head", "/tmp", attachments);
  await finish(service, key);
  await service.send(key, "Compare these blocks", id, "context", "head", "/tmp", attachments);
  expect(prompts).toHaveLength(1);
  expect(JSON.parse(prompts[0].split("(untrusted JSON):\n")[1].split("\n\nSupporting PR context")[0])).toEqual(attachments);
  expect(prompts[0]).toContain("Compare these blocks");
  expect((await createChatService(disk, runner).get(key)).messages[0].attachments).toEqual(attachments);
  await service.send(key, "Follow up", randomUUID(), "context", "head", "/tmp", []);
  expect((await finish(service, key)).messages[2].attachments).toEqual([]);
  expect(() => validateChatAttachments([{ ...attachments[0], anchor: { ...attachments[0].anchor, end: 1 } }])).toThrow("range");
  expect(() => validateChatAttachments(Array(21).fill(attachments[0]))).toThrow("20 code selections or comments");
  expect(() => validateChatAttachments([{ ...attachments[0], body: "x".repeat(80001) }])).toThrow("80,000");
  expect(validateChatAttachments([{ ...attachments[0], body: "" }])).toEqual([{ ...attachments[0], body: "" }]);
  expect(() => validateChatAttachments([{ ...attachments[0], body: null }])).toThrow("comment text");
});

test("attached ranges are the primary subject of vague questions, with PR context secondary", () => {
  const attachment = { filePath: "parser.js", body: "", anchor: { side: "LEFT", start: 4, end: 6, revision: "old", excerpt: "parse(input)" } };
  const prompt = buildChatPrompt("What uses this?", "Full PR background", [attachment]);
  expect(prompt).toContain('"what uses this?" as referring to those attachments');
  expect(prompt).toContain("Do not give a general PR summary or review unless the user explicitly asks");
  expect(prompt).toContain("do not substitute code from a different revision");
  expect(prompt.indexOf(JSON.stringify([attachment]))).toBeLessThan(prompt.indexOf("Full PR background"));
  expect(prompt).toContain("User message:\nWhat uses this?");
  const general = buildChatPrompt("Summarize this PR", "Full PR background", []);
  expect(general).not.toContain("Primary subject");
  expect(general).not.toContain("Supporting PR context");
  expect(general).toContain("Answer the user's question about this PR");
});

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
  await first.send(key, "Review this PR", randomUUID(), "PR context", "revision-a", "/tmp", []);
  expect((await finish(first, key)).sessionId).toBe(sessionId);
  const second = createChatService(disk, runner);
  await second.send(key, "What about tests?", randomUUID(), "Updated context", "revision-b", "/tmp", []);
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
  await service.send(key, "First", id, "context", "a", "/tmp", []);
  expect((await service.send(key, "First", id, "context", "a", "/tmp", [])).messages).toHaveLength(1);
  await expect(service.send(key, "Second", randomUUID(), "context", "a", "/tmp", [])).rejects.toThrow("already responding");
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
  await service.send(key, "Review", randomUUID(), "context", "a", "/tmp", []);
  const saved = await finish(service, key);
  expect(saved.error).toBe("Authentication expired");
  expect(saved.sessionId).toBe(sessionId);
  await disk.update(key, (state) => ({ ...state, status: "running" }));
  expect((await createChatService(disk, async () => {}).get(key)).error).toContain("interrupted");
  expect(() => chatKey("../repo", 1)).toThrow();
  await expect(service.send(key, " ", randomUUID(), "context", "a", "/tmp", [])).rejects.toThrow("message");
});

test("reloaded chat services preserve active turns and accept code-only attachments with fresh handling", async () => {
  const disk = await store();
  const active = new Set();
  const key = chatKey("owner/repo", 1);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const original = createChatServiceWithRuntime(disk, async ({ onEvent }) => {
    await gate;
    await onEvent({ type: "item.completed", item: { type: "agent_message", text: "First answer" } });
  }, active);
  await original.send(key, "First question", randomUUID(), "context", "head", "/tmp", []);
  let newRunnerCalled = false;
  const reloaded = createChatServiceWithRuntime(disk, async ({ onEvent }) => {
    newRunnerCalled = true;
    await onEvent({ type: "item.completed", item: { type: "agent_message", text: "Code explained" } });
  }, active);
  expect((await reloaded.get(key)).status).toBe("running");
  await expect(reloaded.send(key, "Another question", randomUUID(), "context", "head", "/tmp", [])).rejects.toThrow("already responding");
  release();
  await finish(reloaded, key);
  const attachments = [{ id: randomUUID(), filePath: "src/styles.css", body: "", revision: "head", anchor: { side: "RIGHT", start: 462, end: 471, excerpt: ".example {}", revision: "head" } }];
  await reloaded.send(key, "What uses this?", randomUUID(), "context", "head", "/tmp", attachments);
  const saved = await finish(reloaded, key);
  expect(newRunnerCalled).toBe(true);
  expect(saved.messages[2].attachments).toEqual(attachments);
  expect(saved.messages[3].text).toBe("Code explained");
});
