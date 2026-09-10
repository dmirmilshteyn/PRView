import { readFile } from "node:fs/promises";
import path from "node:path";
import { repositoryArtifacts } from "./repositories.js";

export function createPRReviewerService(cwd, api) {
  async function pages(endpoint) {
    const users = [];
    for (let page = 1; ; page += 1) {
      const result = await api("GET", `${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`, null);
      users.push(...result);
      if (result.length < 100) {
        return users;
      }
    }
  }

  async function list(repository, number) {
    if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..") || !Number.isSafeInteger(number) || number < 1) {
      throw new Error("A repository and positive PR number are required");
    }
    const details = JSON.parse(await readFile(path.join(repositoryArtifacts(cwd, repository), "pr", String(number), "details.json"), "utf8"));
    if (details.repository.toLowerCase() !== repository.toLowerCase()) {
      throw new Error("PR repository does not match");
    }
    const repoPath = `repos/${details.repository}`;
    const [repo, pr] = await Promise.all([api("GET", repoPath, null), api("GET", `${repoPath}/pulls/${number}`, null)]);
    // Never use global user search or GitHub's suggested reviewers: either can
    // include people outside the organization and the repository's collaborators.
    const [members, collaborators] = await Promise.all([
      repo.owner.type === "Organization" ? pages(`orgs/${repo.owner.login}/members`) : Promise.resolve([]),
      pages(`${repoPath}/collaborators?affiliation=all`),
    ]);
    const requested = new Set((pr.requested_reviewers ?? []).map((user) => user.login.toLowerCase()));
    const users = new Map();
    for (const user of [...members, ...collaborators]) {
      if (user.type !== "User" || user.login.toLowerCase() === pr.user.login.toLowerCase()) {
        continue;
      }
      users.set(user.login.toLowerCase(), { login: user.login, requested: requested.has(user.login.toLowerCase()) });
    }
    return {
      repository: details.repository,
      users: [...users.values()].sort((left, right) => left.login.localeCompare(right.login)),
      reviewRequests: [...(pr.requested_reviewers ?? []).map((user) => ({ login: user.login })), ...(pr.requested_teams ?? []).map((team) => ({ name: team.name, slug: team.slug }))],
    };
  }

  async function request(repository, number, login) {
    if (typeof login !== "string" || !/^[a-z\d][a-z\d-]{0,38}$/i.test(login)) {
      throw new Error("Select a valid GitHub username");
    }
    // Reload eligibility on every mutation, even if the picker was opened earlier.
    const candidates = await list(repository, number);
    const user = candidates.users.find((item) => item.login.toLowerCase() === login.toLowerCase());
    if (!user) {
      throw new Error("This user is not an eligible organization member or repository collaborator");
    }
    if (user.requested) {
      return { login: user.login, reviewRequests: candidates.reviewRequests };
    }
    const result = await api("POST", `repos/${candidates.repository}/pulls/${number}/requested_reviewers`, { reviewers: [user.login] });
    if (!result.requested_reviewers?.some((reviewer) => reviewer.login.toLowerCase() === user.login.toLowerCase())) {
      throw new Error("GitHub did not add this reviewer. Check repository access and PR permissions.");
    }
    return { login: user.login, reviewRequests: [...result.requested_reviewers.map((reviewer) => ({ login: reviewer.login })), ...(result.requested_teams ?? []).map((team) => ({ name: team.name, slug: team.slug }))] };
  }
  return { list, request };
}
