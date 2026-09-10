import { previewGitHubReview } from "../../../lib/github-review.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) {
      return Response.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
    }
    const text = await request.text();
    if (text.length > 20000) {
      throw new Error("Preview request is too large");
    }
    const { repository, number, review } = JSON.parse(text);
    return Response.json(await previewGitHubReview(process.cwd(), repository, number, review), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
