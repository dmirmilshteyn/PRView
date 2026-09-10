import { createDefaultPRStatusService } from "../../../lib/pr-status.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const key = Symbol.for("prview.pr-status-service");
const service = globalThis[key] ??= createDefaultPRStatusService(process.cwd());

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await service.read(params.get("repository"), Number(params.get("number"))), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message, pollAfterMs: error.retryAfterMs ?? 60000 }, { status: 503 });
  }
}
