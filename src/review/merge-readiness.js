import { hasMergeConflict, pullRequestCI } from "../stack/stack.js";

export function mergeReadiness(details) {
  const ci = pullRequestCI(details);
  const decision = details.reviewDecisionState ?? details.reviewDecision?.toUpperCase().replaceAll(" ", "_");
  const threads = details.github?.threads;
  const unresolved = Array.isArray(threads) ? threads.filter((thread) => !thread.isResolved).length : null;
  const requests = details.reviewRequests?.length;
  const mergeable = Object.hasOwn(details, "liveMergeable") ? details.liveMergeable : details.mergeability ?? details.mergeable;
  const rows = [
    { label: "PR state", status: !details.liveState ? "unknown" : details.liveState !== "OPEN" || details.draft ? "attention" : "pass", detail: details.liveState === "MERGED" ? "Already merged" : details.liveState === "CLOSED" ? "Closed" : details.draft ? "Draft — mark ready for review" : details.liveState ? "Open and ready for review" : "Waiting for live status" },
    { label: "Merge conflicts", status: hasMergeConflict(details) ? "attention" : mergeable === true || mergeable === "MERGEABLE" ? "pass" : "unknown", detail: hasMergeConflict(details) ? "Resolve conflicts with the base branch" : mergeable === true || mergeable === "MERGEABLE" ? "No merge conflicts" : "GitHub is still checking mergeability" },
    { label: "CI checks", status: ci === "success" ? "pass" : ci === "none" ? "unknown" : "attention", detail: ({ success: "Reported checks passed", failure: "One or more checks failed", pending: "Checks queued or running", none: "No checks reported" })[ci] },
    { label: "Approvals", status: decision === "APPROVED" || decision === "" ? "pass" : ["CHANGES_REQUESTED", "REVIEW_REQUIRED", "AWAITING_REVIEW"].includes(decision) ? "attention" : "unknown", detail: decision === "APPROVED" ? "Approved" : decision === "" ? "No approval requirement reported" : decision === "CHANGES_REQUESTED" ? "Changes requested" : ["REVIEW_REQUIRED", "AWAITING_REVIEW"].includes(decision) ? "Awaiting approval" : "Approval requirements not available", saved: true },
    { label: "Review requests", status: requests == null ? "unknown" : requests ? "attention" : "pass", detail: requests == null ? "Not available" : requests ? `${requests} outstanding · ${details.reviewRequests.map((actor) => actor.login || actor.name || actor.slug).join(", ")}` : "No outstanding requests" },
    { label: "Review threads", status: unresolved == null ? "unknown" : unresolved ? "attention" : "pass", detail: unresolved == null ? "Refresh to import review threads" : unresolved ? `${unresolved} unresolved ${unresolved === 1 ? "thread" : "threads"}` : "All review threads resolved", saved: true },
    { label: "GitHub merge requirements", status: details.mergeState === "clean" ? "pass" : !details.mergeState || details.mergeState === "unknown" ? "unknown" : "attention", detail: ({ clean: "GitHub reports this PR can merge", blocked: "Branch rules or merge requirements are blocking merge", behind: "Branch must be updated", dirty: "Merge conflicts must be resolved", unstable: "Some checks have not passed", draft: "Draft PRs cannot merge", unknown: "Waiting for GitHub" })[details.mergeState] ?? "Requirements have not been confirmed" },
  ];
  return { rows, summary: details.liveState === "MERGED" ? "Merged" : details.liveState === "CLOSED" ? "Closed" : rows.some((row) => row.status === "attention") ? "Needs attention" : rows.some((row) => row.status === "unknown") ? "Status incomplete" : "No known blockers" };
}
