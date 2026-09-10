import { readFile } from "node:fs/promises";
import path from "node:path";

export function createPRAssignmentService(cwd, api) {
  async function assignSelf(repository, number) {
    if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..") || !Number.isSafeInteger(number) || number < 1) {
      throw new Error("A repository and positive PR number are required");
    }
    const details = JSON.parse(await readFile(path.join(cwd, "artifacts", "pr", String(number), "details.json"), "utf8"));
    if (details.repository.toLowerCase() !== repository.toLowerCase()) {
      throw new Error("PR repository does not match");
    }
    const viewer = await api("GET", "user", null);
    if (typeof viewer.login !== "string" || !viewer.login) {
      throw new Error("Could not identify the signed-in GitHub user");
    }
    // Adding an assignee preserves everyone already assigned and is safe to retry.
    const result = await api("POST", `repos/${details.repository}/issues/${number}/assignees`, { assignees: [viewer.login] });
    if (!result.assignees?.some((assignee) => assignee.login.toLowerCase() === viewer.login.toLowerCase())) {
      throw new Error("GitHub did not assign you to this PR. Check your repository permissions.");
    }
    return { login: viewer.login, assignees: result.assignees.map((assignee) => assignee.login) };
  }
  return { assignSelf };
}
