import { expect, test } from "bun:test";
import { discussionEntries, oldestFirst } from "../src/review/discussion-order.js";

test("discussion interleaves comments, reviews and threads oldest first without separating their replies", () => {
  const details = { github: {
    comments: [{ id: 1, created_at: "2026-09-05" }, { id: 2, created_at: "2026-09-01" }],
    reviews: [{ id: 3, submitted_at: "2026-09-03" }],
    inlineComments: [{ id: 4, created_at: "2026-09-02" }, { id: 5, in_reply_to_id: 4, created_at: "2026-09-06" }],
  } };
  const result = discussionEntries(details, [{ id: 6, createdAt: "2026-09-04" }]);
  expect(result.map((entry) => entry.key)).toEqual(["comment-2", "inline-4", "review-3", "local-6", "comment-1"]);
  expect(details.github.comments[0].id).toBe(1);
});

test("replies sort oldest first, with stable ties and undated messages last", () => {
  expect(oldestFirst([{ id: 1 }, { id: 2, created_at: "2026-09-02" }, { id: 3, created_at: "2026-09-01" }, { id: 4, created_at: "2026-09-01" }]).map((item) => item.id)).toEqual([3, 4, 2, 1]);
  expect(discussionEntries({ reviewHistory: [{ id: 1, submittedAt: "2026-09-01" }] }, [])[0].kind).toBe("review");
});
