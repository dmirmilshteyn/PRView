import path from "node:path";
import { readFile } from "node:fs/promises";
import { chatKey } from "../../../lib/chat-store.js";
import { runCodex } from "../../../lib/codex-chat.js";
import { tourFingerprint, tourInput } from "../../../lib/tour.js";
import { createTourStore } from "../../../lib/tour-store.js";
import { createTourService } from "../../../lib/tour-service.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const serviceKey = Symbol.for("prview.tour-service");
const service = globalThis[serviceKey] ??= createTourService(createTourStore(path.join(process.cwd(), ".pr-tours")), runCodex, process.cwd());

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const key = `${chatKey(params.get("repository") ?? "", Number(params.get("pr")))}/${params.get("fingerprint")}`;
    return Response.json(await service.get(key), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}

export async function PATCH(request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) {
      return Response.json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
    }
    const text = await request.text();
    if (text.length > 2000) {
      throw new Error("Tour update is too large");
    }
    const { repository, number, fingerprint, section, reviewed } = JSON.parse(text);
    const key = `${chatKey(repository, number)}/${fingerprint}`;
    const state = await service.markReviewed(key, section, reviewed);
    return Response.json({ reviewedSections: state.reviewedSections }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) {
      return Response.json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
    }
    const text = await request.text();
    if (text.length > 4000) {
      throw new Error("Tour request is too large");
    }
    const { repository, number, revision, baseSha, retry } = JSON.parse(text);
    const prKey = chatKey(repository, number);
    const folder = path.join(process.cwd(), "artifacts", "pr", String(number));
    const details = JSON.parse(await readFile(path.join(folder, "details.json"), "utf8"));
    if (details.repository.toLowerCase() !== repository.toLowerCase()) {
      throw new Error("PR repository does not match");
    }
    if ((details.revision ?? details.headSha) !== revision || details.baseSha !== baseSha) {
      return Response.json({ error: "This PR has a newer snapshot. Refresh the page before opening its tour." }, { status: 409 });
    }
    let snapshot;
    if (typeof revision !== "string" || !/^[a-f0-9]{40,64}$/.test(revision)) {
      throw new Error("Refresh this PR to create a code snapshot before generating a tour.");
    }
    try {
      // History snapshots are atomically replaced as a complete details/diff
      // pair, so a simultaneous sync cannot mix old metadata with new code.
      snapshot = JSON.parse(await readFile(path.join(process.cwd(), "artifacts", "history", details.repository, String(number), `${revision}.json`), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error("Refresh this PR to create a code snapshot before generating a tour.");
      }
      throw error;
    }
    if (snapshot.details.repository.toLowerCase() !== repository.toLowerCase() || snapshot.details.revision !== revision || snapshot.details.baseSha !== baseSha || snapshot.details.diffBaseSha !== details.diffBaseSha) {
      throw new Error("The code snapshot changed during sync. Refresh the page and try again.");
    }
    const input = tourInput(snapshot.details, snapshot.diff);
    if (!input.files.length) {
      return Response.json({ status: "empty", tour: null });
    }
    const fingerprint = tourFingerprint(input);
    const key = `${prKey}/${fingerprint}`;
    await service.get(key);
    const state = await service.generate(key, input, retry === true);
    return Response.json({ ...state, fingerprint }, { status: state.status === "running" ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
