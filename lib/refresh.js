import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { repositoryArtifacts } from "./repositories.js";

export function runRefresh(repository, number, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["./pr", "sync", repository, String(number)], { cwd, detached: true, stdio: ["ignore", "ignore", "pipe"] });
    let errorOutput = "";
    let timedOut = false;
    child.stderr.on("data", (chunk) => { errorOutput = (errorOutput + chunk.toString()).slice(-4000); });
    const timeout = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }
    }, 10 * 60 * 1000);
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("Could not start sync. Check the devcontainer installation."));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error("Refresh timed out. Please try again."));
      } else if (code !== 0) {
        reject(new Error(errorOutput.trim() || "Refresh failed. Check GitHub authentication and try again."));
      } else {
        resolve();
      }
    });
  });
}

export function createRefreshService(cwd, runner) {
  let active = null;
  async function refresh(repository, number) {
    if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..") || !Number.isSafeInteger(number) || number < 1) {
      throw new Error("A repository and positive PR number are required");
    }
    const details = JSON.parse(await readFile(path.join(repositoryArtifacts(cwd, repository), "pr", String(number), "details.json"), "utf8"));
    if (details.repository.toLowerCase() !== repository.toLowerCase()) {
      throw new Error("PR repository does not match");
    }
    const key = `${repository.toLowerCase()}:${number}`;
    // Every sync updates the shared dashboard index. Avoid competing writes
    // from simultaneous refreshes, and share repeated requests for this PR.
    if (active) {
      if (active.key === key) {
        return active.promise;
      }
      throw new Error("Another PR is refreshing. Wait for it to finish, then try again.");
    }
    const promise = Promise.resolve().then(() => runner(details.repository, number, cwd)).finally(() => { active = null; });
    active = { key, promise };
    return promise;
  }
  return { refresh };
}
