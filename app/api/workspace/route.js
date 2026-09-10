import { readWorkspace, runWorkspaceCommand, updateWorkspace } from "../../../lib/repositories.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(readWorkspace(process.cwd()), { headers: { "Cache-Control": "no-store" } });
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
    return Response.json(await updateWorkspace(process.cwd(), JSON.parse(text), runWorkspaceCommand), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
