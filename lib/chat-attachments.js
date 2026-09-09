export function validateChatAttachments(value) {
  if (!Array.isArray(value) || value.length > 20 || JSON.stringify(value).length > 80000) {
    throw new Error("Attach up to 20 comments totaling at most 80,000 characters");
  }
  return value.map((item) => {
    if (!item || typeof item.id !== "string" || typeof item.filePath !== "string" || !item.filePath || typeof item.body !== "string" || !item.body.trim() || typeof item.revision !== "string") {
      throw new Error("Each attachment needs a file, comment, and revision");
    }
    const anchor = item.anchor;
    if (!anchor || !["LEFT", "RIGHT"].includes(anchor.side) || !Number.isInteger(anchor.start) || !Number.isInteger(anchor.end) || anchor.start < 1 || anchor.end < anchor.start || typeof anchor.excerpt !== "string" || typeof anchor.revision !== "string") {
      throw new Error("Each attachment needs a valid code range");
    }
    return { id: item.id, filePath: item.filePath, body: item.body, revision: item.revision, anchor: { side: anchor.side, start: anchor.start, end: anchor.end, excerpt: anchor.excerpt, revision: anchor.revision } };
  });
}
