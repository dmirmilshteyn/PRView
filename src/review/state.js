export function emptyReview() {
  return { version: 1, reviewed: {}, drafts: {}, notes: [], reviews: [], reviewDrafts: {}, positions: {}, fileViews: {}, preferences: {}, baselineRevision: null };
}

export function draftKey(revision, filePath) {
  return JSON.stringify([revision, filePath]);
}

export function applyOperation(state, operation) {
  const next = structuredClone(state);
  switch (operation.type) {
    case "cancelReview": {
      // Wait for GitHub before restoring the draft; there is no optimistic change.
      break;
    }
    case "pin": {
      next.pinned = operation.value;
      break;
    }
    case "reviewDraft": {
      next.reviewDrafts = { ...next.reviewDrafts, [operation.revision]: operation.draft };
      break;
    }
    case "finalReview": {
      if ((next.reviews ?? []).some((review) => review.id === operation.review.id)) {
        break;
      }
      next.reviews = [...(next.reviews ?? []), { ...operation.review, source: "local" }];
      next.reviewDrafts = { ...next.reviewDrafts, [operation.review.revision]: { body: "", event: "COMMENT" } };
      break;
    }
    case "reviewed": {
      if (operation.value) {
        next.reviewed = { ...next.reviewed, [operation.filePath]: { revision: operation.revision, fingerprint: operation.fingerprint } };
        next.baselineRevision ??= operation.revision;
      } else {
        delete next.reviewed[operation.filePath];
      }
      break;
    }
    case "draft": {
      next.drafts[draftKey(operation.revision, operation.filePath)] = operation.draft;
      break;
    }
    case "note": {
      if (next.notes.some((note) => note.id === operation.note.id)) {
        break;
      }
      next.notes.push(operation.note);
      const key = draftKey(operation.note.revision, operation.note.filePath);
      const draft = next.drafts[key];
      next.drafts[key] = { body: "", severity: "info", anchor: null, open: false, replyDrafts: draft?.replyDrafts ?? {} };
      break;
    }
    case "resolve": {
      const note = next.notes.find((item) => item.id === operation.id);
      if (note) {
        note.resolved = operation.resolved;
      }
      break;
    }
    case "reply": {
      const note = next.notes.find((item) => item.id === operation.id);
      if (note && !(note.replies ?? []).some((reply) => reply.id === operation.reply.id)) {
        note.replies = [...(note.replies ?? []), operation.reply];
      }
      break;
    }
    case "position": {
      next.positions[operation.revision] = operation.position;
      break;
    }
    case "preferences": {
      next.preferences = { ...next.preferences, ...operation.preferences };
      break;
    }
    case "fileView": {
      next.fileViews = { ...next.fileViews, [draftKey(operation.revision, operation.filePath)]: operation.view };
      break;
    }
    case "baseline": {
      next.baselineRevision = operation.revision;
      break;
    }
    default: {
      throw new Error("Unknown review operation");
    }
  }
  return next;
}
