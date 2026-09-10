export function oldestFirst(messages) {
  function timestamp(message) {
    const value = Date.parse(message.created_at ?? message.submitted_at ?? message.submittedAt ?? message.createdAt);
    return Number.isFinite(value) ? value : Infinity;
  }
  return [...messages].sort((left, right) => timestamp(left) - timestamp(right));
}

export function discussionEntries(details, localReviews) {
  const github = details.github;
  const groups = [
    ["comment", github?.comments ?? []],
    ["review", github?.reviews ?? details.reviewHistory ?? []],
    ["inline", (github?.inlineComments ?? []).filter((comment) => !comment.in_reply_to_id)],
    ["local", localReviews],
  ];
  return oldestFirst(groups.flatMap(([kind, messages]) => messages.map((message, index) => ({ ...message, kind, key: `${kind}-${message.id ?? index}`, message }))));
}
