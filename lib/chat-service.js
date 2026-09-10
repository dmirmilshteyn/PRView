import { validateChatAttachments } from "./chat-attachments.js";
import { buildChatPrompt } from "./chat-prompt.js";
import { randomUUID } from "node:crypto";

export function reviewChatMetadata(details) {
  const fields = ["number", "repository", "title", "body", "description", "shortSummary", "author", "branch", "baseBranch", "headSha", "baseSha", "diffBaseSha", "revision"];
  const metadata = Object.fromEntries(fields.filter((field) => details[field] !== undefined).map((field) => [field, details[field]]));
  metadata.discussion = ["comments", "reviews", "inlineComments"].flatMap((kind) => (details.github?.[kind] ?? []).filter((comment) => comment.body?.trim()).map((comment) => ({
    body: comment.body,
    path: comment.path,
    line: comment.line,
    startLine: comment.start_line,
    side: comment.side,
    startSide: comment.start_side,
    replyTo: comment.in_reply_to_id,
    id: comment.id,
  })));
  return metadata;
}

export function createChatService(store, runner) {
  return createChatServiceWithRuntime(store, runner, new Set());
}

export function createChatServiceWithRuntime(store, runner, active) {

  async function get(key) {
    const state = await store.read(key);
    if (state.status === "running" && !active.has(key)) {
      return store.update(key, (current) => ({ ...current, status: "error", error: "The agent was interrupted. Send another message to continue this session." }));
    }
    return state;
  }

  async function send(key, message, requestId, context, revision, cwd, attachments) {
    const attached = validateChatAttachments(attachments);
    if (typeof message !== "string" || !message.trim() || message.length > 10000 || !/^[a-f0-9-]{36}$/i.test(requestId ?? "")) {
      throw new Error("A message of up to 10,000 characters and a request ID are required");
    }
    let started = false;
    const state = await store.update(key, (current) => {
      if (current.messages.some((item) => item.id === requestId)) {
        return current;
      }
      if (active.has(key)) {
        throw new Error("The agent is already responding to this PR. Wait for it to finish.");
      }
      active.add(key);
      started = true;
      return { ...current, status: "running", error: null, activity: "Reviewing…", messages: [...current.messages, { id: requestId, role: "user", text: message.trim(), attachments: attached, createdAt: new Date().toISOString() }] };
    }).catch((error) => {
      if (started) {
        active.delete(key);
      }
      throw error;
    });
    if (!started) {
      return state;
    }
    const prompt = buildChatPrompt(message, context, attached);
    async function run() {
      let answered = false;
      try {
        await runner({ sessionId: state.sessionId, prompt, cwd, onEvent: async (event) => {
          if (event.type === "thread.started") {
            await store.update(key, (current) => ({ ...current, sessionId: event.thread_id, contextRevision: revision }));
          }
          if (event.type === "item.completed" && event.item?.type === "agent_message") {
            answered = true;
            await store.update(key, (current) => ({ ...current, messages: [...current.messages, { id: randomUUID(), role: "assistant", text: event.item.text, createdAt: new Date().toISOString() }] }));
          }
          if (event.type === "item.started" && event.item?.type === "command_execution") {
            await store.update(key, (current) => ({ ...current, activity: "Reading review context…" }));
          }
        } });
        if (!answered) {
          throw new Error("The agent finished without a response. Send another message to continue.");
        }
        await store.update(key, (current) => ({ ...current, status: "idle", activity: null }));
      } catch (error) {
        await store.update(key, (current) => ({ ...current, status: "error", activity: null, error: error.message }));
      } finally {
        active.delete(key);
      }
    }
    void run().catch(() => { active.delete(key); });
    return state;
  }
  return { get, send };
}
