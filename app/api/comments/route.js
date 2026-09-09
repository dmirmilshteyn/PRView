import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const commentsPath = path.join(process.cwd(), "artifacts", "comments.json");

async function readComments() {
  try {
    return JSON.parse(await readFile(commentsPath, "utf8"));
  } catch {
    return [];
  }
}

export async function GET(request) {
  const pullRequestNumber = new URL(request.url).searchParams.get("pr");
  const comments = await readComments();

  return Response.json(
    pullRequestNumber ? comments.filter((comment) => String(comment.pullRequestNumber) === pullRequestNumber) : comments,
  );
}

export async function POST(request) {
  const payload = await request.json();
  const pullRequestNumber = Number(payload.pullRequestNumber);
  const filePath = typeof payload.filePath === "string" ? payload.filePath.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (!Number.isInteger(pullRequestNumber) || !filePath || !body) {
    return Response.json({ error: "pullRequestNumber, filePath, and body are required" }, { status: 400 });
  }

  const comments = await readComments();
  const comment = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    pullRequestNumber,
    filePath,
    body,
    parentId: typeof payload.parentId === "string" ? payload.parentId : null,
    author: "You",
    createdAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(commentsPath), { recursive: true });
  await writeFile(commentsPath, JSON.stringify([...comments, comment], null, 2) + "\n");

  return Response.json(comment, { status: 201 });
}
