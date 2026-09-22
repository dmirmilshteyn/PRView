import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { readWorkspace, runWorkspaceCommand, repositoryArtifacts, validateRepository } from "./repositories.js";

export function createRepositorySyncService(cwd, runner) {
  const jobs = new Map();
  function read(repository) {
    validateRepository(repository);
    let job = jobs.get(repository.toLowerCase());
    const file = path.join(repositoryArtifacts(cwd, repository), "sync.json");
    let saved = null;
    try {
      if (!job || statSync(file).mtimeMs >= job.startedAt) {
        saved = JSON.parse(readFileSync(file, "utf8"));
        if (job?.finishedAt && statSync(file).mtimeMs > job.finishedAt) {
          job = null;
        }
      }
    } catch {}
    if (job) {
      return { ...job, ...saved, status: job.status, error: job.error };
    }
    if (saved?.status === "running") {
      try {
        if (!saved.pid) {
          throw new Error("Missing sync process");
        }
        process.kill(saved.pid, 0);
      } catch {
        return { ...saved, status: "error", error: "Sync was interrupted. Sync again to resume; completed PRs are saved." };
      }
    }
    return saved ?? { status: "idle", completed: 0, total: 0, failed: [] };
  }
  function start(repository) {
    validateRepository(repository);
    const known = readWorkspace(cwd).repositories.find((item) => item.toLowerCase() === repository.toLowerCase());
    if (!known) {
      throw new Error("Add the repository before syncing it");
    }
    if (read(known).status === "running") {
      return read(known);
    }
    const job = { status: "running", startedAt: Date.now(), completed: 0, total: 0, failed: [], error: null };
    jobs.set(known.toLowerCase(), job);
    void Promise.resolve().then(() => runner(cwd, ["sync", known, "--all"])).then(() => {
      job.status = "complete";
      job.finishedAt = Date.now();
    }).catch((error) => {
      job.status = "error";
      job.finishedAt = Date.now();
      job.error = error.message;
    });
    return read(known);
  }
  return { read, start };
}

const runtimeKey = Symbol.for("prview.repository-sync");
export const repositorySync = globalThis[runtimeKey] ??= createRepositorySyncService(process.cwd(), runWorkspaceCommand);
