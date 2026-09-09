function sameRepository(left, right) {
  return typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
}

export function hasPullRequestApproval(details) {
  return (details.github?.reviews ?? details.reviewHistory ?? []).some((review) => review.state === "APPROVED");
}

export function pullRequestCI(details) {
  const checks = details.checkRuns ?? [];
  if (!checks.length) {
    return "none";
  }
  const states = checks.map((check) => {
    if (check.status && check.status !== "COMPLETED") {
      return "pending";
    }
    const result = check.conclusion || check.state;
    if (["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"].includes(result)) {
      return "failure";
    }
    if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(result)) {
      return "success";
    }
    return "pending";
  });
  if (states.includes("failure")) {
    return "failure";
  }
  return states.includes("pending") ? "pending" : "success";
}

export function getPullRequestStack(current, imported) {
  const repositoryPRs = imported.filter((pr) => sameRepository(pr.repository, current.repository));
  const availableNumbers = new Set(repositoryPRs.map((pr) => pr.number));
  if (current.stack?.entries?.some((entry) => entry.number === current.number)) {
    return {
      ...current.stack,
      source: "github",
      entries: [...current.stack.entries].reverse().map((entry) => ({
        ...entry,
        available: availableNumbers.has(entry.number),
        approved: entry.number === current.number
          ? hasPullRequestApproval(current)
          : repositoryPRs.find((pr) => pr.number === entry.number)?.approved === true,
        ci: entry.number === current.number ? pullRequestCI(current) : repositoryPRs.find((pr) => pr.number === entry.number)?.ci ?? "none",
      })),
    };
  }

  return null;
}

export function stackEntryStatus(entry) {
  if (entry.state === "MERGED") {
    return { label: "Merged", kind: "merged", description: "Merged" };
  }
  if (entry.state === "CLOSED") {
    return { label: "Closed", kind: "closed", description: "Closed without merging" };
  }
  if (entry.state === "QUEUED") {
    return { label: "Queued", kind: "queued", description: "Queued for merging" };
  }
  if (entry.draft) {
    return { label: "Draft", kind: "draft", description: "Draft pull request" };
  }
  return { label: "Ready", kind: "ready", description: "Ready for review" };
}
