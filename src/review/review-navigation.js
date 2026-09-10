export function nextUnreviewedIndex(keys, currentIndex, reviewed) {
  for (let offset = 1; offset < keys.length; offset += 1) {
    const index = (currentIndex + offset) % keys.length;
    if (!reviewed.has(keys[index])) {
      return index;
    }
  }
  return null;
}

export function ignoresReviewShortcut(event) {
  return event.defaultPrevented || event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || Boolean(event.target.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']"));
}
