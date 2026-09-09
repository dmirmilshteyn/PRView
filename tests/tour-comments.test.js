import { expect, test } from "bun:test";
import { tourCommentLine } from "../src/review/tour-comments.js";

test("tour threads match their source side and revision and include overlapping ranges", () => {
  const reference = { side: "RIGHT", start: 10, end: 20 };
  const anchor = { side: "RIGHT", revision: "head", start: 12, end: 15 };
  expect(tourCommentLine(anchor, reference, "head")).toBe(15);
  expect(tourCommentLine({ ...anchor, start: 5, end: 25 }, reference, "head")).toBe(20);
  expect(tourCommentLine({ ...anchor, end: 9, start: 5 }, reference, "head")).toBeNull();
  expect(tourCommentLine({ ...anchor, start: 21, end: 25 }, reference, "head")).toBeNull();
  expect(tourCommentLine(anchor, reference, "other-head")).toBeNull();
  expect(tourCommentLine({ ...anchor, side: "LEFT" }, reference, "head")).toBeNull();
  expect(tourCommentLine({ ...anchor, side: "LEFT", sourceSide: "RIGHT" }, reference, "head")).toBe(15);
  expect(tourCommentLine({ ...anchor, side: "LEFT" }, { ...reference, side: "LEFT" }, "head")).toBe(15);
  expect(tourCommentLine(null, reference, "head")).toBeNull();
});
