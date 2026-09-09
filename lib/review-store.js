import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyOperation, emptyReview } from "../src/review/state.js";

const queues = new Map();

function reviewPath(root, repository, number) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..") || !Number.isSafeInteger(number) || number < 1) {
    throw new Error("A repository and positive PR number are required");
  }
  const repositoryId = createHash("sha256").update(repository.toLowerCase()).digest("hex");
  return path.join(root, repositoryId, `${number}.json`);
}

export async function readReview(root, repository, number) {
  const filePath = reviewPath(root, repository, number);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return emptyReview();
    }
    throw error;
  }
}

function validText(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 10000;
}

function validAnchor(anchor) {
  return anchor === null || (anchor && ["LEFT", "RIGHT"].includes(anchor.side) && Number.isSafeInteger(anchor.start) && Number.isSafeInteger(anchor.end) && anchor.start > 0 && anchor.end >= anchor.start && typeof anchor.excerpt === "string");
}

export function validateOperation(operation) {
  if (!operation || typeof operation !== "object") {
    throw new Error("An operation is required");
  }
  const fileRevision = validText(operation.filePath) && validText(operation.revision);
  const draft = operation.draft;
  const note = operation.note;
  const review = operation.review;
  const reviewEvent = (value) => ["COMMENT", "REQUEST_CHANGES", "APPROVE"].includes(value);
  const allowedSeverity = (value) => ["info", "question", "warning", "blocking"].includes(value);
  const validators = {
    pin: () => typeof operation.value === "boolean",
    reviewDraft: () => validText(operation.revision) && draft && typeof draft.body === "string" && draft.body.length <= 10000 && reviewEvent(draft.event),
    finalReview: () => review && validText(review.id) && validText(review.revision) && reviewEvent(review.event) && typeof review.body === "string" && review.body.length <= 10000 && (review.event === "APPROVE" || validText(review.body.trim())) && review.source === "local" && typeof review.createdAt === "string" && Number.isFinite(Date.parse(review.createdAt)),
    reviewed: () => fileRevision && typeof operation.value === "boolean" && validText(operation.fingerprint),
    draft: () => fileRevision && draft && typeof draft.body === "string" && allowedSeverity(draft.severity) && validAnchor(draft.anchor) && typeof draft.replyDrafts === "object" && draft.replyDrafts !== null,
    note: () => note && validText(note.id) && validText(note.revision) && validText(note.filePath) && validText(note.body?.trim()) && allowedSeverity(note.severity) && validAnchor(note.anchor) && typeof note.createdAt === "string" && note.resolved === false && Array.isArray(note.replies) && note.replies.length === 0,
    resolve: () => validText(operation.id) && typeof operation.resolved === "boolean",
    reply: () => validText(operation.id) && validText(operation.reply?.id) && validText(operation.reply?.body?.trim()) && typeof operation.reply?.createdAt === "string",
    position: () => validText(operation.revision) && typeof operation.position?.filePath === "string" && Number.isFinite(operation.position?.offset),
    preferences: () => operation.preferences && Object.entries(operation.preferences).every(([key, value]) => (["split", "ignoreWhitespace", "sinceReview"].includes(key) && typeof value === "boolean")),
    fileView: () => fileRevision && Number.isSafeInteger(operation.view?.context) && operation.view.context >= 3 && operation.view.context <= 10003 && typeof operation.view.full === "boolean" && ["LEFT", "RIGHT"].includes(operation.view.fullSide),
    baseline: () => validText(operation.revision),
  };
  if (!validators[operation.type]?.()) {
    throw new Error("Invalid review operation");
  }
}

export async function updateReview(root, repository, number, operation) {
  validateOperation(operation);
  const destination = reviewPath(root, repository, number);
  const previous = queues.get(destination) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    const current = await readReview(root, repository, number);
    if (["resolve", "reply"].includes(operation.type) && !current.notes.some((note) => note.id === operation.id)) {
      throw new Error("Note not found");
    }
    const next = applyOperation(current, operation);
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", "utf8");
    await rename(temporary, destination);
    return next;
  });
  queues.set(destination, pending);
  try {
    return await pending;
  } finally {
    if (queues.get(destination) === pending) {
      queues.delete(destination);
    }
  }
}
