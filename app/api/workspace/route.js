import { repositorySync } from "../../../lib/repository-sync.js";
import { readWorkspace, runWorkspaceCommand, updateWorkspace } from "../../../lib/repositories.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  try {
    const workspace = readWorkspace(process.cwd());
    const repository = new URL(request.url).searchParams.get("repository") ?? workspace.activeRepository;
    return Response.json({ ...workspace, sync: repository ? repositorySync.read(repository) : null }, { headers: { "Cache-Control": "no-store" } });
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
    const input = JSON.parse(text);
    if (input.action === "sync") {
      return Response.json({ ...readWorkspace(process.cwd()), sync: repositorySync.start(input.repository) }, { status: 202 });
    }
    return Response.json(await updateWorkspace(process.cwd(), input, runWorkspaceCommand), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
