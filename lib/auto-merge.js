import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { repositoryArtifacts } from "./repositories.js";
import { promisify } from "node:util";

export async function runGraphQL(query, variables) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
  }
  const { stdout } = await promisify(execFile)("gh", args, { timeout: 30000, maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout);
  if (result.errors?.length) {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }
  return result.data;
}

export function createAutoMergeService(cwd, graphql) {
  async function read(repository, number) {
    if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..") || !Number.isSafeInteger(number) || number < 1) {
      throw new Error("A repository and positive PR number are required");
    }
    const details = JSON.parse(await readFile(path.join(repositoryArtifacts(cwd, repository), "pr", String(number), "details.json"), "utf8"));
    if (details.repository.toLowerCase() !== repository.toLowerCase()) {
      throw new Error("PR repository does not match");
    }
    const [owner, name] = details.repository.split("/");
    const data = await graphql(`query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        autoMergeAllowed squashMergeAllowed mergeCommitAllowed rebaseMergeAllowed
        pullRequest(number: $number) { id state isDraft viewerCanEnableAutoMerge viewerCanDisableAutoMerge autoMergeRequest { mergeMethod } }
      }
    }`, { owner, name, number });
    const repo = data.repository;
    const pr = repo?.pullRequest;
    if (!pr) {
      throw new Error("Pull request is unavailable on GitHub");
    }
    return {
      id: pr.id,
      enabled: Boolean(pr.autoMergeRequest),
      mergeMethod: pr.autoMergeRequest?.mergeMethod ?? null,
      methods: [repo.squashMergeAllowed && "SQUASH", repo.mergeCommitAllowed && "MERGE", repo.rebaseMergeAllowed && "REBASE"].filter(Boolean),
      canEnable: repo.autoMergeAllowed && pr.state === "OPEN" && !pr.isDraft && pr.viewerCanEnableAutoMerge,
      canDisable: pr.viewerCanDisableAutoMerge,
    };
  }

  async function update(repository, number, enabled, mergeMethod) {
    if (typeof enabled !== "boolean" || (enabled && !["SQUASH", "MERGE", "REBASE"].includes(mergeMethod))) {
      throw new Error("A boolean enabled value and valid merge method are required");
    }
    const current = await read(repository, number);
    if (current.enabled === enabled) {
      return current;
    }
    if (enabled ? !current.canEnable || !current.methods.includes(mergeMethod) : !current.canDisable) {
      throw new Error("GitHub does not allow this auto-merge change for this PR");
    }
    const operation = enabled ? "enablePullRequestAutoMerge" : "disablePullRequestAutoMerge";
    // Use the dedicated auto-merge mutation; never fall back to merging the PR.
    const data = await graphql(`mutation($id: ID!${enabled ? ", $method: PullRequestMergeMethod!" : ""}) {
      ${operation}(input: { pullRequestId: $id${enabled ? ", mergeMethod: $method" : ""} }) { pullRequest { autoMergeRequest { mergeMethod } } }
    }`, { id: current.id, ...(enabled ? { method: mergeMethod } : {}) });
    const request = data[operation].pullRequest.autoMergeRequest;
    return { ...current, enabled: Boolean(request), mergeMethod: request?.mergeMethod ?? null, canEnable: !request, canDisable: Boolean(request) };
  }
  return { read, update };
}
