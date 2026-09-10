import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readReview, updateReview, updateReviewSubmission, validateOperation } from "./review-store.js";

function marker(kind, id) {
  return `<!-- prview-${kind}:${createHash("sha256").update(id).digest("hex")} -->`;
}

export function prepareReviewComments(state, review, files) {
  const sent = new Set(state.reviews.filter((item) => item.github?.status === "submitted").flatMap((item) => item.github.comments?.map((comment) => comment.noteId) ?? []));
  return state.notes.filter((note) => !note.resolved && !sent.has(note.id)).map((note) => {
    if (note.revision !== review.revision || (note.anchor?.revision && note.anchor.revision !== review.revision)) {
      throw new Error(`Comment on ${note.filePath} belongs to an earlier or comparison snapshot. Re-anchor it or resolve it before submitting.`);
    }
    if (!files.some((file) => file.path === note.filePath)) {
      throw new Error(`Commented file ${note.filePath} is not in this PR diff.`);
    }
    const comment = {
      noteId: note.id, path: note.filePath,
      body: [note.body, ...(note.replies ?? []).map((reply) => `Reply:\n${reply.body}`), marker("comment", `${review.id}:${note.id}`)].join("\n\n"),
      subjectType: note.anchor ? "LINE" : "FILE",
    };
    if (note.anchor) {
      comment.line = note.anchor.end;
      comment.side = note.anchor.side;
      if (note.anchor.start !== note.anchor.end) {
        comment.startLine = note.anchor.start;
        comment.startSide = note.anchor.side;
      }
    }
    return comment;
  });
}

export async function previewGitHubReview(cwd, repository, number, review) {
  validateOperation({ type: "finalReview", review });
  const state = await readReview(path.join(cwd, ".local-reviews"), repository, number);
  const folder = path.join(cwd, "artifacts", "pr", String(number));
  const details = JSON.parse(await readFile(path.join(folder, "details.json"), "utf8"));
  if (details.repository.toLowerCase() !== repository.toLowerCase()) {
    throw new Error("PR repository does not match");
  }
  if (details.revision !== review.revision || !details.headSha) {
    throw new Error("Select the latest synced snapshot to preview your GitHub review.");
  }
  const diff = JSON.parse(await readFile(path.join(folder, "diff.json"), "utf8"));
  const comments = prepareReviewComments(state, review, diff.files);
  const token = createHash("sha256").update(JSON.stringify({ review, comments, head: details.headSha, base: details.baseSha })).digest("hex");
  return { review, comments, token };
}

export function createGitHubReviewService(cwd, api) {
  const root = path.join(cwd, ".local-reviews");
  const active = new Map();

  async function pages(endpoint) {
    const result = [];
    for (let page = 1; ; page += 1) {
      const items = await api("GET", `${endpoint}?per_page=100&page=${page}`, null);
      result.push(...items);
      if (items.length < 100) {
        return result;
      }
    }
  }

  async function execute(repository, number, operation) {
    if (operation.previewToken) {
      const previous = await readReview(root, repository, number);
      if (!previous.reviews.some((item) => item.id === operation.review.id)) {
        const preview = await previewGitHubReview(cwd, repository, number, operation.review);
        if (preview.token !== operation.previewToken) {
          throw new Error("Review content changed after preview. Open the preview again before submitting.");
        }
      }
    }
    const { id, revision, event, body, createdAt } = operation.review;
    let state = await updateReview(root, repository, number, { type: "finalReview", review: { id, revision, event, body, createdAt, source: "local" } });
    const review = state.reviews.find((item) => item.id === operation.review.id);
    if (review.github?.status === "submitted") {
      return state;
    }
    let submission = { ...review.github, status: "pending", error: null };
    async function save() {
      state = await updateReviewSubmission(root, repository, number, review.id, submission);
      return state;
    }
    try {
      if (state.reviews.some((item) => item.id !== review.id && item.github?.comments && !["submitted", "cancelled"].includes(item.github.status))) {
        throw new Error("Finish retrying the previous GitHub review before submitting another review.");
      }
      await save();
      const folder = path.join(cwd, "artifacts", "pr", String(number));
      const details = JSON.parse(await readFile(path.join(folder, "details.json"), "utf8"));
      if (details.repository.toLowerCase() !== repository.toLowerCase()) {
        throw new Error("PR repository does not match");
      }
      const endpoint = `repos/${details.repository}/pulls/${number}`;
      const reviewMarker = marker("review", review.id);
      // Reconcile before mutating: a previous request may have succeeded even
      // when its response or the following local write was lost.
      let remote = (await pages(`${endpoint}/reviews`)).find((item) => item.body?.includes(reviewMarker));
      if (remote && remote.state !== "PENDING") {
        if (remote.state !== { APPROVE: "APPROVED", COMMENT: "COMMENTED", REQUEST_CHANGES: "CHANGES_REQUESTED" }[review.event]) {
          throw new Error("This GitHub review was changed externally. Refresh the PR before continuing.");
        }
        submission = { ...submission, status: "submitted", id: remote.id, url: remote.html_url };
        return await save();
      }
      if (details.revision !== review.revision || !details.headSha) {
        throw new Error("Review the latest synced snapshot before submitting to GitHub.");
      }
      const pr = await api("GET", endpoint, null);
      if (pr.head.sha !== details.headSha || (details.baseSha && pr.base.sha !== details.baseSha)) {
        throw new Error("The PR changed on GitHub. Refresh and review the latest snapshot before submitting.");
      }
      if (!submission.comments) {
        if (operation.previewToken) {
          const preview = await previewGitHubReview(cwd, repository, number, operation.review);
          if (preview.token !== operation.previewToken) {
            throw new Error("Review content changed after preview. Return to draft and preview again.");
          }
        }
        const diff = JSON.parse(await readFile(path.join(folder, "diff.json"), "utf8"));
        submission = { ...submission, comments: prepareReviewComments(state, review, diff.files), commitId: details.headSha };
        await save();
      }
      if (submission.commitId !== pr.head.sha) {
        throw new Error("The PR changed since this review was prepared. Refresh before continuing.");
      }
      if (!remote) {
        remote = await api("POST", `${endpoint}/reviews`, { commit_id: submission.commitId, body: [review.body, reviewMarker].filter(Boolean).join("\n\n") });
      }
      submission = { ...submission, id: remote.id, url: remote.html_url };
      await save();
      const existing = await pages(`${endpoint}/reviews/${remote.id}/comments`);
      for (const comment of submission.comments) {
        const commentMarker = marker("comment", `${review.id}:${comment.noteId}`);
        if (existing.some((item) => item.body?.includes(commentMarker))) {
          continue;
        }
        const { noteId, ...input } = comment;
        await api("POST", "graphql", {
          query: "mutation($input: AddPullRequestReviewThreadInput!) { addPullRequestReviewThread(input: $input) { thread { id } } }",
          variables: { input: { ...input, pullRequestReviewId: remote.node_id } },
        });
      }
      // Approval must apply to the reviewed head, including when adding many comments.
      const latest = await api("GET", endpoint, null);
      if (latest.head.sha !== submission.commitId || (details.baseSha && latest.base.sha !== details.baseSha)) {
        throw new Error("The PR changed while the review was being prepared. Refresh before submitting.");
      }
      const result = await api("POST", `${endpoint}/reviews/${remote.id}/events`, { event: review.event, body: [review.body, reviewMarker].filter(Boolean).join("\n\n") });
      submission = { ...submission, status: "submitted", id: result.id, url: result.html_url };
      return await save();
    } catch (error) {
      submission = { ...submission, status: "failed", error: error.message };
      await save();
      throw new Error(`Review saved locally; GitHub submission failed: ${error.message}`);
    }
  }

  async function cancel(repository, number, id) {
    const state = await readReview(root, repository, number);
    const review = state.reviews.find((item) => item.id === id);
    if (!review?.github || review.github.status === "submitted" || review.github.status === "cancelled") {
      return state;
    }
    const endpoint = `repos/${repository}/pulls/${number}/reviews`;
    const remote = (await pages(endpoint)).find((item) => item.body?.includes(marker("review", id)));
    if (remote && remote.state !== "PENDING") {
      if (remote.state !== { APPROVE: "APPROVED", COMMENT: "COMMENTED", REQUEST_CHANGES: "CHANGES_REQUESTED" }[review.event]) {
        throw new Error("The review was changed on GitHub. Refresh to inspect it.");
      }
      return updateReviewSubmission(root, repository, number, id, { ...review.github, status: "submitted", error: null, id: remote.id, url: remote.html_url });
    }
    if (remote) {
      await api("DELETE", `${endpoint}/${remote.id}`, null);
    }
    await updateReview(root, repository, number, { type: "reviewDraft", revision: review.revision, draft: { event: review.event, body: review.body } });
    return updateReviewSubmission(root, repository, number, id, { ...review.github, status: "cancelled", error: null });
  }

  async function submit(repository, number, operation) {
    validateOperation(operation);
    if (!["finalReview", "cancelReview"].includes(operation.type)) {
      throw new Error("A final review is required");
    }
    await readReview(root, repository, number);
    const id = operation.type === "cancelReview" ? operation.id : operation.review.id;
    const task = `${operation.type}:${id}`;
    const key = `${repository.toLowerCase()}:${number}`;
    if (active.has(key)) {
      const running = active.get(key);
      if (running.id === task) {
        return running.promise;
      }
      throw new Error("Another review is being submitted for this PR");
    }
    const promise = (operation.type === "cancelReview" ? cancel(repository, number, id) : execute(repository, number, operation)).finally(() => active.delete(key));
    active.set(key, { id: task, promise });
    return promise;
  }
  return { submit };
}
