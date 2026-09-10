export function isCheckPending(check) {
  if (check.status) {
    return check.status.toUpperCase() !== "COMPLETED";
  }
  return !["SUCCESS", "FAILURE", "ERROR", "NEUTRAL", "SKIPPED", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"].includes((check.conclusion || check.state || "").toUpperCase());
}

export function hasPendingChecks(checkRuns) {
  return checkRuns.some(isCheckPending);
}

export function summarizeChecks(checkRuns) {
  const failing = checkRuns.filter((check) => !isCheckPending(check) && ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"].includes((check.conclusion || check.state || "").toUpperCase())).length;
  const pending = checkRuns.filter(isCheckPending).length;
  if (failing) {
    return `${failing} check${failing === 1 ? "" : "s"} failing`;
  }
  if (pending) {
    return `${pending} check${pending === 1 ? "" : "s"} pending`;
  }
  return checkRuns.length ? "All checks passed" : "No checks reported";
}
