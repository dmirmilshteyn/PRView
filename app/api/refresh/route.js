import { createRefreshService, runRefresh } from "../../../lib/refresh.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const serviceKey = Symbol.for("prview.refresh-service");
const service = globalThis[serviceKey] ??= createRefreshService(process.cwd(), runRefresh);

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host") && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin refreshes are not allowed" }, { status: 403 });
  }
  try {
    const text = await request.text();
    if (text.length > 2000) {
      return Response.json({ error: "Refresh request is too large" }, { status: 413 });
    }
    const { repository, number } = JSON.parse(text);
    await service.refresh(repository, number);
    return Response.json({ refreshed: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
