import path from "node:path";
import { readReview, updateReview, validateOperation } from "../../../lib/review-store.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    const state = await readReview(path.join(process.cwd(), ".local-reviews"), params.get("repository") ?? "", Number(params.get("pr")));
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
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
    if (text.length > 256000) {
      return Response.json({ error: "Review operation is too large" }, { status: 413 });
    }
    const { repository, number, operation } = JSON.parse(text);
    validateOperation(operation);
    const state = await updateReview(path.join(process.cwd(), ".local-reviews"), repository, number, operation);
    return Response.json(state);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
