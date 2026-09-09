export function tourCommentLine(anchor, reference, revision) {
  if (!anchor || anchor.revision !== revision || (anchor.sourceSide ?? anchor.side) !== reference.side || anchor.start > reference.end || anchor.end < reference.start) {
    return null;
  }
  return Math.min(anchor.end, reference.end);
}
