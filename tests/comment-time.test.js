import { expect, test } from "bun:test";
import { friendlyCommentTime } from "../src/review/comment-time.js";

test("friendly comment timestamps handle recent activity and exact local time", () => {
  const now = new Date(2026, 8, 9, 14, 30);
  expect(friendlyCommentTime(new Date(now - 20000).toISOString(), now, "en-US").label).toBe("Just now");
  expect(friendlyCommentTime(new Date(now - 120000).toISOString(), now, "en-US").label).toBe("2 minutes ago");
  const time = friendlyCommentTime(new Date(2026, 8, 9, 12, 5).toISOString(), now, "en-US");
  expect(time.label).toBe("Today at 12:05 PM");
  expect(time.exact).toContain("September 9, 2026");
  expect(time.iso).toBe(new Date(2026, 8, 9, 12, 5).toISOString());
});

test("yesterday uses the local calendar boundary, including across DST", () => {
  expect(friendlyCommentTime(new Date(2026, 8, 8, 23, 30).toISOString(), new Date(2026, 8, 9, 1), "en-US").label).toBe("Yesterday at 11:30 PM");
  expect(friendlyCommentTime(new Date(2026, 2, 8, 0, 30).toISOString(), new Date(2026, 2, 9, 1), "en-US").label).toBe("Yesterday at 12:30 AM");
});

test("older timestamps include the year when needed and tolerate missing legacy dates", () => {
  const now = new Date(2026, 8, 9, 14, 30);
  expect(friendlyCommentTime(new Date(2026, 8, 1, 9).toISOString(), now, "en-US").label).toBe("Sep 1 at 9:00 AM");
  expect(friendlyCommentTime(new Date(2025, 8, 1, 9).toISOString(), now, "en-US").label).toBe("Sep 1, 2025 at 9:00 AM");
  expect(friendlyCommentTime(undefined, now, "en-US")).toBeNull();
  expect(friendlyCommentTime("bad date", now, "en-US")).toBeNull();
});
