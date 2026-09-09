export function anchorLocation(anchor, revision, leftRevision) {
  if (!anchor) {
    return null;
  }
  const sourceSide = anchor.sourceSide ?? anchor.side;
  const sourceRevision = anchor.revision ?? revision;
  if (sourceRevision === revision && sourceSide === "RIGHT") {
    return { side: "RIGHT", line: anchor.end };
  }
  if (sourceRevision === leftRevision && sourceSide === (leftRevision === revision ? "LEFT" : "RIGHT")) {
    return { side: "LEFT", line: anchor.end };
  }
  return null;
}

export function commentKey(location) {
  return location ? `${location.side}:${location.line}` : null;
}

export function placeComments(notes, draft, visibleLines, revision, leftRevision) {
  const groups = new Map();
  const remaining = [];
  for (const note of notes) {
    const key = commentKey(anchorLocation(note.anchor ? { ...note.anchor, revision: note.anchor.revision ?? note.revision } : null, revision, leftRevision));
    if (key && visibleLines.has(key)) {
      groups.set(key, [...(groups.get(key) ?? []), note]);
    } else {
      remaining.push(note);
    }
  }
  const draftLocation = draft.open ? anchorLocation(draft.anchor, revision, leftRevision) : null;
  const draftLine = commentKey(draftLocation);
  return { groups, remaining, draftLine: visibleLines.has(draftLine) ? draftLine : null };
}
