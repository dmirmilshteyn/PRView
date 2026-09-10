import { expect, test } from "bun:test";
import { chatDraftKey, readChatDraft, writeChatDraft, clearSentChatDraft } from "../src/review/chat-draft.js";
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const attachment = { id: "note", filePath: "file.js", body: "", revision: "head", anchor: { side: "RIGHT", start: 1, end: 2, excerpt: "code", revision: "head" } };
test("chat draft and pending context survive reload and stay isolated by repository and PR", () => {
  const disk = storage(); const key = chatDraftKey("Owner/Repo", 23);
  const value = { message: "What does this do?", attachments: [attachment], pendingRequest: null };
  writeChatDraft(disk, key, value);
  expect(readChatDraft(disk, chatDraftKey("owner/repo", 23))).toEqual(value);
  expect(readChatDraft(disk, chatDraftKey("owner/repo", 24)).message).toBe("");
  expect(readChatDraft(disk, chatDraftKey("other/repo", 23)).attachments).toEqual([]);
});
test("successful sends clear only their draft and preserve context attached during the request", () => {
  const disk = storage(); const key = chatDraftKey("owner/repo", 23);
  const request = { requestId: "request", message: "Question", attachments: [attachment] };
  const extra = { ...attachment, id: "extra" };
  writeChatDraft(disk, key, { message: "Question", attachments: [attachment, extra], pendingRequest: request });
  expect(clearSentChatDraft(disk, key, request)).toEqual({ message: "", attachments: [extra], pendingRequest: null });
  writeChatDraft(disk, key, { message: "New question", attachments: [extra], pendingRequest: { ...request, requestId: "new" } });
  expect(clearSentChatDraft(disk, key, request).message).toBe("New question");
});
test("an interrupted send retains its request identity across reload", () => {
  const disk = storage(); const key = chatDraftKey("owner/repo", 23);
  const request = { requestId: "request", message: "Question", attachments: [attachment] };
  writeChatDraft(disk, key, { message: "Question", attachments: [attachment], pendingRequest: request });
  expect(readChatDraft(disk, key).pendingRequest).toEqual(request);
});
