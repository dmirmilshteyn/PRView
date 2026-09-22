export function approvalStatus(details) {
  const latest = new Map();
  const reviews = [...(details.github?.reviews ?? details.reviewHistory ?? [])].sort((a, b) => (a.submitted_at ?? a.submittedAt ?? "").localeCompare(b.submitted_at ?? b.submittedAt ?? ""));
  for (const review of reviews) {
    if (!["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) {
      continue;
    }
    const login = review.user?.login ?? review.author?.login;
    latest.set(login?.toLowerCase() ?? String(review.id ?? latest.size), { login, state: review.state });
  }
  const approvals = [...latest.values()].filter((review) => review.state === "APPROVED");
  const decision = details.reviewDecisionState;
  const approved = decision === "APPROVED" || approvals.length > 0;
  const byYou = Boolean(details.viewerLogin) && approvals.some((review) => review.login?.toLowerCase() === details.viewerLogin?.toLowerCase());
  const names = approvals.map((review) => review.login).filter(Boolean);
  const label = approved ? `Approved${byYou ? " by you" : names.length ? ` by ${names.join(", ")}` : ""}${byYou && names.length > 1 ? " and others" : ""}${decision === "CHANGES_REQUESTED" ? "; changes also requested" : ""}` : decision === "CHANGES_REQUESTED" ? "Changes requested; no current approvals" : "No current approvals";
  return { approved, byYou, label };
}
