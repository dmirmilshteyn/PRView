import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runCICheck } from "./ci-status.js";
import { hasPendingChecks } from "../src/review/ci-status.js";

export function parseGitHubResponse(output) {
  const separator = output.search(/\r?\n\r?\n/);
  const header = output.slice(0, separator);
  const status = Number(header.match(/^HTTP\/\S+ (\d+)/)?.[1]);
  if (!status || separator < 0) {
    throw new Error("Invalid GitHub status response");
  }
  const headers = Object.fromEntries(header.split(/\r?\n/).slice(1).map((line) => {
    const colon = line.indexOf(":");
    return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
  }));
  const body = output.slice(separator).trim();
  return { status, headers, data: body ? JSON.parse(body) : null };
}

export async function fetchPRStatus(repository, number, etag) {
  const args = ["api", "--include", `repos/${repository}/pulls/${number}`];
  if (etag) {
    args.push("-H", `If-None-Match: ${etag}`);
  }
  try {
    const { stdout } = await promisify(execFile)("gh", args, { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
    return parseGitHubResponse(stdout);
  } catch (error) {
    if (error.stdout?.startsWith("HTTP/")) {
      return parseGitHubResponse(error.stdout);
    }
    throw new Error("Could not refresh GitHub status");
  }
}

export function createPRStatusService(cwd, fetchStatus, fetchChecks, now) {
  const cache = new Map();
  async function read(repository, number) {
    if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..") || !Number.isSafeInteger(number) || number < 1) {
      throw new Error("A repository and positive PR number are required");
    }
    const details = JSON.parse(await readFile(path.join(cwd, "artifacts/pr", String(number), "details.json"), "utf8"));
    if (details.repository.toLowerCase() !== repository.toLowerCase()) {
      throw new Error("PR repository does not match");
    }
    const key = `${repository.toLowerCase()}:${number}`;
    let entry = cache.get(key);
    if (!entry) {
      entry = { nextAt: 0, etag: null, value: null, inFlight: null, failures: 0, warning: null, checks: details.checkRuns ?? [], checkHead: details.headSha, snapshot: details.syncedAt };
      cache.set(key, entry);
    }
    if (entry.inFlight) {
      return entry.inFlight;
    }
    if (entry.snapshot !== details.syncedAt) {
      entry.snapshot = details.syncedAt;
      entry.checks = details.checkRuns ?? [];
      entry.checkHead = details.headSha;
    }
    function result() {
      if (!entry.value) {
        const error = new Error(entry.warning || "GitHub status is temporarily unavailable");
        error.retryAfterMs = Math.max(60000, entry.nextAt - now());
        throw error;
      }
      return { ...entry.value, checkRuns: entry.checks, warning: entry.warning, pollAfterMs: Math.max(60000, entry.nextAt - now()) };
    }
    if (now() < entry.nextAt) {
      return result();
    }
    entry.inFlight = (async () => {
      try {
        const response = await fetchStatus(details.repository, number, entry.etag);
        if (![200, 304].includes(response.status)) {
          const reset = Number(response.headers["x-ratelimit-reset"]) * 1000;
          const retry = Number(response.headers["retry-after"]) * 1000;
          if (response.status === 429 || response.status === 403) {
            entry.nextAt = Math.max(now() + 60000, Number.isFinite(reset) ? reset + 1000 : 0, Number.isFinite(retry) ? now() + retry : 0);
          }
          throw new Error(response.status === 429 || response.status === 403 ? "GitHub access or rate limit reached; polling is backing off." : "Could not refresh GitHub status; retrying later.");
        }
        if (response.status === 200) {
          const pr = response.data;
          entry.etag = response.headers.etag ?? null;
          entry.value = {
            liveState: pr.merged ? "MERGED" : pr.state.toUpperCase(), draft: pr.draft,
            mergeConflict: pr.mergeable === false, mergeState: pr.mergeable_state,
            liveMergeable: pr.mergeable ?? null,
            currentHeadSha: pr.head.sha,
            assignees: pr.assignees.map((user) => user.login),
            reviewRequests: [...pr.requested_reviewers.map((user) => ({ login: user.login })), ...pr.requested_teams.map((team) => ({ name: team.name, slug: team.slug }))],
          };
        }
        if (entry.value?.liveState === "OPEN" && (hasPendingChecks(entry.checks) || entry.checkHead !== entry.value.currentHeadSha)) {
          entry.checks = await fetchChecks(details.repository, number);
          entry.checkHead = entry.value.currentHeadSha;
        }
        entry.failures = 0;
        entry.warning = null;
        entry.nextAt = now() + (entry.value?.liveState === "OPEN" ? 60000 : 300000);
      } catch (error) {
        entry.failures += 1;
        entry.warning = error.message;
        entry.nextAt = Math.max(entry.nextAt, now() + Math.min(900000, 60000 * 2 ** (entry.failures - 1)));
      }
      return result();
    })().finally(() => { entry.inFlight = null; });
    return entry.inFlight;
  }
  return { read };
}

export function createDefaultPRStatusService(cwd) {
  return createPRStatusService(cwd, fetchPRStatus, runCICheck, Date.now);
}
