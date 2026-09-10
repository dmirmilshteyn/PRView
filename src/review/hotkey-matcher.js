export function createHotkeyMatcher() {
  const pressed = new Set();
  const shortcuts = { cg: "copy", ea: "assign", er: "reviewer" };
  let previous = null;

  function reset() {
    pressed.clear();
    previous = null;
  }

  function keyDown(key, time) {
    pressed.add(key);
    const sequence = previous && time - previous.time <= 750
      ? shortcuts[previous.key + key]
      : null;
    const chord = pressed.size === 2
      ? Object.entries(shortcuts).find(([keys]) => [...keys].every((part) => pressed.has(part)))?.[1]
      : null;
    const action = sequence || chord;
    if (action) {
      reset();
      return action;
    }
    previous = key === "c" || key === "e" ? { key, time } : null;
    return null;
  }

  function keyUp(key) {
    pressed.delete(key);
  }

  return { keyDown, keyUp, reset };
}
