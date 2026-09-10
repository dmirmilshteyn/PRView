import { createGitHubThreadService } from "../../../lib/github-thread.js";
import { runGitHubAPI } from "../../../lib/github-api.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const service = createGitHubThreadService(process.cwd(), runGitHubAPI);

export async function POST(request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) {
      return Response.json({ error: "Cross-origin changes are not allowed" }, { status: 403 });
    }
    const text = await request.text();
    if (text.length > 70000) {
      return Response.json({ error: "Request is too large" }, { status: 413 });
    }
    return Response.json(await service.act(JSON.parse(text)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
