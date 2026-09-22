import { runWorkspaceCommand } from "./repositories.js";
import { readPRSnapshot } from "./pr-snapshot.js";
import path from "node:path";
import { repositoryArtifacts } from "./repositories.js";

export function runRefresh(repository, number, cwd) {
  return runWorkspaceCommand(cwd, ["sync", repository, String(number)]);
}

export function createRefreshService(cwd, runner) {
  const active = new Map();
  async function refresh(repository, number) {
    if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..") || !Number.isSafeInteger(number) || number < 1) {
      throw new Error("A repository and positive PR number are required");
    }
    const details = readPRSnapshot(path.join(repositoryArtifacts(cwd, repository), "pr", String(number))).details;
    if (details.repository.toLowerCase() !== repository.toLowerCase()) {
      throw new Error("PR repository does not match");
    }
    const key = `${repository.toLowerCase()}:${number}`;
    // Serialize refreshes within each repository; unrelated repositories can sync.
    const running = active.get(repository.toLowerCase());
    if (running) {
      if (running.key === key) {
        return running.promise;
      }
      throw new Error("Another PR is refreshing. Wait for it to finish, then try again.");
    }
    const promise = Promise.resolve().then(() => runner(details.repository, number, cwd)).finally(() => { active.delete(repository.toLowerCase()); });
    active.set(repository.toLowerCase(), { key, promise });
    return promise;
  }
  return { refresh };
}
