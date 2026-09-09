import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import App from "../../src/App.jsx";

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function loadReviewData() {
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

  try {
    for (const number of readdirSync(path.join(artifactsPath, "pr"))) {
      prDetails[number] = readJson(path.join(artifactsPath, "pr", number, "details.json"), null);
      prDiffs[number] = readJson(path.join(artifactsPath, "pr", number, "diff.json"), null);
    }
  } catch {
    // Artifacts are generated separately and may not exist in a fresh checkout.
  }

  return { prs, prDetails, prDiffs };
}

export default function Page() {
  const { prs, prDetails, prDiffs } = loadReviewData();

  return <App pullRequests={prs} prDetails={prDetails} prDiffs={prDiffs} />;
}
