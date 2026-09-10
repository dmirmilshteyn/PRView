import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { repositoryArtifacts } from "./repositories.js";

export function createGitHubThreadService(cwd, api) {
  const inFlight = new Map();

  async function perform(input) {
    const { repository, number, commentId, action, body, requestId } = input;
    if (typeof repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..") || !Number.isSafeInteger(number) || number < 1 || (action !== "comment" && (!Number.isSafeInteger(commentId) || commentId < 1)) || !["comment", "reply", "resolve", "unresolve"].includes(action)) {
      throw new Error("A repository, PR, imported comment, and valid action are required");
    }
    if (["reply", "comment"].includes(action) && (typeof body !== "string" || !body.trim() || body.length > 60000 || typeof requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(requestId))) {
      throw new Error("A reply and request identifier are required");
    }
    const details = JSON.parse(await readFile(path.join(repositoryArtifacts(cwd, repository), "pr", String(number), "details.json"), "utf8"));
    if (details.repository.toLowerCase() !== repository.toLowerCase()) {
      throw new Error("PR repository does not match");
    }
    const comment = details.github?.inlineComments?.find((item) => item.id === commentId && !item.in_reply_to_id);
    if (action !== "comment" && !comment) {
      throw new Error("This root comment is not imported for this PR. Refresh the PR first.");
    }
    if (["reply", "comment"].includes(action)) {
      const discussion = action === "comment";
      const collection = `repos/${details.repository}/${discussion ? "issues" : "pulls"}/${number}/comments`;
      const resultKey = discussion ? "discussionComment" : "comment";
      const marker = `<!-- prview-reply:${createHash("sha256").update(JSON.stringify([repository.toLowerCase(), number, commentId, requestId, body.trim()])).digest("hex")} -->`;
      // Reconcile before posting so retrying a lost response does not duplicate a reply.
      const viewer = await api("GET", "user", null);
      if (!viewer.login) {
        throw new Error("Could not identify the signed-in GitHub user");
      }
      for (let page = 1; ; page += 1) {
        const comments = await api("GET", `${collection}?per_page=100&page=${page}`, null);
        if (!Array.isArray(comments)) {
          throw new Error("Could not read GitHub comments");
        }
        const existing = comments.find((item) => (discussion || item.in_reply_to_id === commentId) && item.user?.login?.toLowerCase() === viewer.login.toLowerCase() && item.body?.includes(marker));
        if (existing) {
          return { [resultKey]: existing };
        }
        if (comments.length < 100) {
          break;
        }
      }
      const reply = await api("POST", discussion ? collection : `${collection}/${commentId}/replies`, { body: `${body.trim()}\n\n${marker}` });
      if (!reply.id || (!discussion && reply.in_reply_to_id !== commentId)) {
        throw new Error("GitHub did not confirm the reply. Retry to check whether it was posted.");
      }
      return { [resultKey]: reply };
    }

    const imported = details.github?.threads?.find((thread) => thread.comments?.nodes?.some((node) => node.databaseId === commentId));
    if (!imported?.id) {
      throw new Error("Thread information is unavailable. Refresh the PR first.");
    }
    const response = await api("POST", "graphql", {
      query: "query($id: ID!) { node(id: $id) { ... on PullRequestReviewThread { id isResolved viewerCanResolve viewerCanUnresolve pullRequest { number repository { nameWithOwner } } } } }",
      variables: { id: imported.id },
    });
    const thread = response.data?.node;
    if (thread?.pullRequest?.number !== number || thread.pullRequest.repository.nameWithOwner.toLowerCase() !== repository.toLowerCase()) {
      throw new Error("GitHub thread does not belong to this PR");
    }
    const resolved = action === "resolve";
    if (thread.isResolved === resolved) {
      return { thread: { id: thread.id, isResolved: resolved } };
    }
    if (!(resolved ? thread.viewerCanResolve : thread.viewerCanUnresolve)) {
      throw new Error(`You do not have permission to ${action} this GitHub thread.`);
    }
    const mutation = resolved ? "resolveReviewThread" : "unresolveReviewThread";
    const result = await api("POST", "graphql", {
      query: `mutation($id: ID!) { ${mutation}(input: {threadId: $id}) { thread { id isResolved } } }`,
      variables: { id: thread.id },
    });
    const updated = result.data?.[mutation]?.thread;
    if (updated?.id !== thread.id || updated.isResolved !== resolved) {
      throw new Error("GitHub did not confirm the thread status. Please try again.");
    }
    return { thread: updated };
  }

  async function act(input) {
    const key = JSON.stringify(input);
    if (inFlight.has(key)) {
      return inFlight.get(key);
    }
    const pending = perform(input).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  }
  return { act };
}
