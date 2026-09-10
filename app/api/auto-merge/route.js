import { createAutoMergeService, runGraphQL } from "../../../lib/auto-merge.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const service = createAutoMergeService(process.cwd(), runGraphQL);

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const status = await service.read(params.get("repository"), Number(params.get("number")));
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) {
    return Response.json({ error: "Cross-origin changes are not allowed" }, { status: 403 });
  }
  try {
    const text = await request.text();
    if (text.length > 2000) {
      return Response.json({ error: "Request is too large" }, { status: 413 });
    }
    const { repository, number, enabled, mergeMethod } = JSON.parse(text);
    return Response.json(await service.update(repository, number, enabled, mergeMethod), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
