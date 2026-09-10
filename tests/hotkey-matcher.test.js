import { expect, test } from "bun:test";
import { createHotkeyMatcher } from "../src/review/hotkey-matcher.js";

test("quick shortcuts work even when the first key is released before the second", () => {
  for (const [keys, action] of [["cg", "copy"], ["ea", "assign"], ["er", "reviewer"]]) {
    const matcher = createHotkeyMatcher();
    expect(matcher.keyDown(keys[0], 0)).toBeNull();
    matcher.keyUp(keys[0]);
    expect(matcher.keyDown(keys[1], 100)).toBe(action);
    matcher.keyUp(keys[1]);
    expect(matcher.keyDown(keys[1], 150)).toBeNull();
  }
});

test("overlapping keys still work in either order", () => {
  for (const keys of ["cg", "gc"]) {
    const matcher = createHotkeyMatcher();
    matcher.keyDown(keys[0], 0);
    expect(matcher.keyDown(keys[1], 1000)).toBe("copy");
  }
});

test("expired, interrupted, and reset sequences do not trigger shortcuts", () => {
  const matcher = createHotkeyMatcher();
  matcher.keyDown("c", 0);
  matcher.keyUp("c");
  expect(matcher.keyDown("g", 751)).toBeNull();
  matcher.reset();
  matcher.keyDown("e", 1000);
  matcher.keyUp("e");
  matcher.keyDown("x", 1100);
  matcher.keyUp("x");
  expect(matcher.keyDown("a", 1200)).toBeNull();
  matcher.reset();
  matcher.keyDown("c", 2000);
  matcher.reset();
  expect(matcher.keyDown("g", 2100)).toBeNull();
});
