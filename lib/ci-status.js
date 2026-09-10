import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { repositoryArtifacts } from "./repositories.js";
import { promisify } from "node:util";

export async function runCICheck(repository, number) {
  const { stdout } = await promisify(execFile)("gh", ["pr", "view", String(number), "--repo", repository, "--json", "statusCheckRollup"], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout).statusCheckRollup ?? [];
}

export function createCIService(cwd, runner) {
  async function read(repository, number) {
    if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..") || !Number.isSafeInteger(number) || number < 1) {
      throw new Error("A repository and positive PR number are required");
    }
    const details = JSON.parse(await readFile(path.join(repositoryArtifacts(cwd, repository), "pr", String(number), "details.json"), "utf8"));
    if (details.repository.toLowerCase() !== repository.toLowerCase()) {
      throw new Error("PR repository does not match");
    }
    return { checkRuns: await runner(details.repository, number) };
  }
  return { read };
}
