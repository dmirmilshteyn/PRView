import { expect, test } from "bun:test";
import { parseRepositoryRoute, repositoryUrl, pullsUrl, pullUrl } from "../src/routes.js";

test("GitHub-style routes retain repository identity for the same PR number", () => {
  expect(repositoryUrl("owner/one")).toBe("/owner/one");
  expect(pullsUrl("owner/one")).toBe("/owner/one/pulls");
  expect(pullUrl("owner/one", 42)).toBe("/owner/one/pull/42");
  expect(pullUrl("owner/two", 42)).toBe("/owner/two/pull/42");
  expect(parseRepositoryRoute(["owner", "one"])).toEqual({ repository: "owner/one", page: "dashboard", number: null });
  expect(parseRepositoryRoute(["owner", "one", "pulls"])).toEqual({ repository: "owner/one", page: "pulls", number: null });
  expect(parseRepositoryRoute(["owner", "two", "pull", "42"])).toEqual({ repository: "owner/two", page: "pull", number: "42" });
});

test("unknown route shapes and invalid PR numbers do not resolve as dashboards", () => {
  for (const segments of [[], ["owner"], ["owner", "repo", "pulls", "42"], ["owner", "repo", "pull", "0"], ["owner", "repo", "pull", "42", "extra"], ["..", "repo"], ["owner", "repo", "other"]]) {
    expect(parseRepositoryRoute(segments)).toBeNull();
  }
});
