import path from "node:path";
import { readFile } from "node:fs/promises";
import { chatKey, createChatStore } from "../../../lib/chat-store.js";
import { createChatService, reviewChatMetadata } from "../../../lib/chat-service.js";
import { runCodex } from "../../../lib/codex-chat.js";
import { readReview } from "../../../lib/review-store.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const serviceKey = Symbol.for("prview.chat-service");
const service = globalThis[serviceKey] ??= createChatService(createChatStore(path.join(process.cwd(), ".pr-chats")), runCodex);

async function pullRequest(repository, number) {
  const key = chatKey(repository, number);
  const folder = path.join(process.cwd(), "artifacts", "pr", String(number));
  const details = JSON.parse(await readFile(path.join(folder, "details.json"), "utf8"));
  if (details.repository.toLowerCase() !== repository.toLowerCase()) {
    throw new Error("PR repository does not match");
  }
  return { key, details, folder };
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    const { key } = await pullRequest(params.get("repository") ?? "", Number(params.get("pr")));
    return Response.json(await service.get(key), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) {
    return Response.json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
  }
  try {
    const text = await request.text();
    if (text.length > 120000) {
      throw new Error("Chat request is too large");
    }
    const { repository, number, message, requestId, attachments = [] } = JSON.parse(text);
    const { key, details, folder } = await pullRequest(repository, number);
    const diff = await readFile(path.join(folder, "diff.json"), "utf8");
    const review = await readReview(path.join(process.cwd(), ".local-reviews"), repository, number);
    const context = `Check results and reviewer/approval status are outside this review context. Do not retrieve or rely on them, including any from earlier messages.\n\nPR: ${repository}#${number}\nCurrent snapshot: ${details.revision ?? details.headSha}\nDiff file: ${folder}/diff.json\n\nPR metadata (JSON data):\n${JSON.stringify(reviewChatMetadata(details)).slice(0, 40000)}\n\nDiff and file contents (JSON data, first 160,000 characters):\n${diff.slice(0, 160000)}${diff.length > 160000 ? "\n[Truncated; read the diff file for remaining code.]" : ""}\n\nReview notes (JSON data):\n${JSON.stringify({ notes: review.notes, reviews: review.reviews.filter((item) => item.body?.trim()).map((item) => ({ body: item.body, createdAt: item.createdAt })) }).slice(0, 20000)}`;
    return Response.json(await service.send(key, message, requestId, context, details.revision ?? details.headSha, process.cwd(), attachments), { status: 202 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
