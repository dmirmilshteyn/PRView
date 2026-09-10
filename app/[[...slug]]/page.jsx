import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import App from "../../src/App.jsx";
import { readReview } from "../../lib/review-store.js";
import { hasPullRequestApproval, pullRequestCI } from "../../src/stack/stack.js";

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export const dynamic = "force-dynamic";

async function loadReviewData(number) {
  const artifactsPath = path.join(process.cwd(), "artifacts");
  const prs = readJson(path.join(artifactsPath, "prs.json"), {
    yourChanges: [],
    needsYourReview: [],
    returnedToYou: [],
    approved: [],
    waitingForReviewers: [],
    drafts: [],
    waitingForAuthor: [],
  });
  const prDetails = {};
  const prDiffs = {};
  const revisions = {};
  // Only active imports are navigable. Stale artifact directories must not
  // make a closed/unsynced stack entry look like a locally available PR.
  const stackPRs = (await Promise.all(Object.values(prs).flat().map(async (pr) => {
    const details = readJson(path.join(artifactsPath, "pr", String(pr.number), "details.json"), null);
    if (!details) {
      return null;
    }
    pr.additions = details.additions;
    pr.deletions = details.deletions;
    pr.author = details.author;
    pr.labels = details.labels ?? [];
    const review = await readReview(path.join(process.cwd(), ".local-reviews"), details.repository, details.number);
    return { number: details.number, repository: details.repository, approved: hasPullRequestApproval(details), ci: pullRequestCI(details), pinned: review.pinned === true };
  }))).filter(Boolean);

  try {
    if (number && /^\d+$/.test(number)) {
      prDetails[number] = readJson(path.join(artifactsPath, "pr", number, "details.json"), null);
      prDiffs[number] = readJson(path.join(artifactsPath, "pr", number, "diff.json"), null);
      const details = prDetails[number];
      const diff = prDiffs[number];
      if (details && diff) {
        details.legacyNotes = readJson(path.join(artifactsPath, "comments.json"), []).filter((comment) => Number(comment.pullRequestNumber) === Number(number));
        for (const file of diff.files) {
          file.fingerprint ??= createHash("sha256").update(JSON.stringify(file)).digest("hex");
        }
        details.revision ??= details.headSha ?? createHash("sha256").update(JSON.stringify(diff)).digest("hex");
        if (/^[\w.-]+\/[\w.-]+$/.test(details.repository) && !details.repository.split("/").some((part) => part === "." || part === "..")) {
          const historyPath = path.join(artifactsPath, "history", details.repository, number);
          try {
            for (const filename of readdirSync(historyPath)) {
              const snapshot = readJson(path.join(historyPath, filename), null);
              if (snapshot?.details?.repository === details.repository && snapshot.diff) {
                revisions[snapshot.details.revision] = snapshot;
              }
            }
          } catch {
            // Legacy artifacts do not have revision history yet.
          }
        }
        revisions[details.revision] = { details, diff };
      }
    }
  } catch {
    // Artifacts are generated separately and may not exist in a fresh checkout.
  }

  return { prs, prDetails, prDiffs, revisions, stackPRs };
}

export default async function Page({ params }) {
  const { slug } = await params;
  const { prs, prDetails, prDiffs, revisions, stackPRs } = await loadReviewData(slug?.[1]);

  return <App pullRequests={prs} prDetails={prDetails} prDiffs={prDiffs} revisions={revisions} stackPRs={stackPRs} />;
}
