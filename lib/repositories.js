import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export function validateRepository(repository) {
  if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Use a repository in OWNER/REPO form");
  }
  return repository;
}

export function repositoryArtifacts(cwd, repository) {
  validateRepository(repository);
  const root = path.join(cwd, "artifacts");
  const scoped = path.join(root, "repos", repository.toLowerCase());
  if (existsSync(scoped)) {
    return scoped;
  }
  const registry = path.join(root, "workspace.json");
  if (existsSync(registry) && JSON.parse(readFileSync(registry, "utf8")).repositories.some((item) => item.toLowerCase() === repository.toLowerCase())) {
    return scoped;
  }
  return root;
}

export function readWorkspace(cwd) {
  const root = path.join(cwd, "artifacts");
  const registry = path.join(root, "workspace.json");
  if (existsSync(registry)) {
    return JSON.parse(readFileSync(registry, "utf8"));
  }
  const index = path.join(root, "prs.json");
  const repositories = new Set();
  if (existsSync(index)) {
    for (const pr of Object.values(JSON.parse(readFileSync(index, "utf8"))).flat()) {
      const file = path.join(root, "pr", String(pr.number), "details.json");
      if (existsSync(file)) {
        const repository = JSON.parse(readFileSync(file, "utf8")).repository;
        if (repository) {
          repositories.add(validateRepository(repository));
        }
      }
    }
  }
  return { activeRepository: [...repositories][0] ?? null, repositories: [...repositories] };
}

export function runWorkspaceCommand(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["./pr", ...args], { cwd, detached: true, stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", (chunk) => { errors = (errors + chunk).slice(-4000); });
    child.once("error", () => { reject(new Error("Could not start the PR CLI")); });
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(errors.trim() || "Repository operation failed"));
      } else {
        resolve();
      }
    });
  });
}

export async function updateWorkspace(cwd, input, runner) {
  const repository = validateRepository(input.repository);
  if (input.action === "track") {
    if (!Number.isSafeInteger(input.number) || input.number < 1) {
      throw new Error("A positive PR number is required");
    }
    await runner(cwd, ["track", repository, String(input.number)]);
  } else if (input.action === "select") {
    await runner(cwd, ["repo", "use", repository]);
  } else if (input.action === "register") {
    await runner(cwd, ["repo", "track", repository]);
  } else {
    throw new Error("Unknown workspace action");
  }
  return readWorkspace(cwd);
}

export function repositoryCheckout(repository) {
  validateRepository(repository);
  const folder = path.join(/* turbopackIgnore: true */ process.env.PRVIEW_REPOSITORIES_DIR ?? "/var/lib/prview/repositories", repository.toLowerCase());
  if (!existsSync(path.join(folder, ".git"))) {
    throw new Error("Sync this repository first to create its local code checkout.");
  }
  return folder;
}
