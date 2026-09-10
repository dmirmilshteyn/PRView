import { createPRReviewerService } from "../../../lib/pr-reviewers.js";
import { runGitHubAPI } from "../../../lib/github-api.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const service = createPRReviewerService(process.cwd(), runGitHubAPI);

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await service.list(params.get("repository"), Number(params.get("number"))), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) {
      return Response.json({ error: "Cross-origin changes are not allowed" }, { status: 403 });
    }
    const text = await request.text();
    if (text.length > 2000) {
      return Response.json({ error: "Request is too large" }, { status: 413 });
    }
    const { repository, number, login } = JSON.parse(text);
    return Response.json(await service.request(repository, number, login), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
