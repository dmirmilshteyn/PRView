import { validateChatAttachments } from "../../lib/chat-attachments.js";

export function chatDraftKey(repository, number) {
  return `prview.chat-draft:${repository.toLowerCase()}:${number}`;
}

export function readChatDraft(storage, key) {
  const text = storage.getItem(key);
  if (!text) {
    return { message: "", attachments: [], pendingRequest: null };
  }
  const value = JSON.parse(text);
  if (typeof value.message !== "string" || value.message.length > 10000) {
    throw new Error("Saved chat draft is invalid");
  }
  return { message: value.message, attachments: validateChatAttachments(value.attachments), pendingRequest: value.pendingRequest ?? null };
}

export function writeChatDraft(storage, key, value) {
  if (!value.message && !value.attachments.length && !value.pendingRequest) {
    storage.removeItem(key);
  } else {
    storage.setItem(key, JSON.stringify(value));
  }
}

export function clearSentChatDraft(storage, key, request) {
  const value = readChatDraft(storage, key);
  // A different view may have edited this draft while the request was running.
  if (value.pendingRequest?.requestId !== request.requestId) {
    return value;
  }
  const next = {
    message: value.message.trim() === request.message ? "" : value.message,
    attachments: value.attachments.filter((item) => !request.attachments.some((sent) => JSON.stringify(sent) === JSON.stringify(item))),
    pendingRequest: null,
  };
  writeChatDraft(storage, key, next);
  return next;
}
