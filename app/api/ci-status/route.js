import { createCIService, runCICheck } from "../../../lib/ci-status.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const service = createCIService(process.cwd(), runCICheck);

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await service.read(params.get("repository"), Number(params.get("number"))), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
