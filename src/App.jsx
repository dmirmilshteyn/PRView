"use client";

import { useState } from "react";

import CodeTour from "./review/CodeTour.jsx";
import ChangeStats from "./review/ChangeStats.jsx";
import ReviewProvider from "./review/ReviewProvider.jsx";
import PinProvider, { usePins } from "./review/PinProvider.jsx";
import PinButton from "./review/PinButton.jsx";
import RefreshButton from "./review/RefreshButton.jsx";
import PRHotkeys from "./review/PRHotkeys.jsx";
import usePRStatus from "./review/usePRStatus.js";
import ReviewChat from "./review/ReviewChat.jsx";
import PullRequestContext from "./review/PullRequestContext.jsx";
import StackNavigator from "./stack/StackNavigator.jsx";
import PRStatusBadge from "./stack/PRStatusBadge.jsx";
import MergeReadiness from "./review/MergeReadiness.jsx";
import TopReviewMenu from "./review/TopReviewMenu.jsx";
import RepositoryControls from "./review/RepositoryControls.jsx";
import { filterPullRequests } from "./dashboard-filters.js";
import { hasMergeConflict } from "./stack/stack.js";
import { getPullRequestStack, nextStackPullRequest } from "./stack/stack.js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { parseRepositoryRoute, repositoryUrl, pullsUrl, pullUrl } from "./routes.js";

const categories = [
  { key: "yourChanges", label: "Your changes", accent: "purple" },
  { key: "needsYourReview", label: "Needs your review", accent: "amber", aliases: ["needsReview"] },
  { key: "returnedToYou", label: "Returned to you", accent: "red" },
  { key: "approved", label: "Approved", accent: "green", aliases: ["readyToMerge"] },
  { key: "waitingForReviewers", label: "Waiting for reviewers", accent: "blue", aliases: ["inProgress"] },
  { key: "drafts", label: "Drafts", accent: "slate" },
  { key: "waitingForAuthor", label: "Waiting for author", accent: "orange" },
];

function getCategoryItems(pullRequests, category) {
  const keys = [category.key, ...(category.aliases ?? [])];

  for (const key of keys) {
    if (pullRequests[key]) {
      return pullRequests[key];
    }
  }

  return [];
}

function Layout({ pullRequests, prDetails, prDiffs, revisions, stackPRs, workspace }) {
  const pathname = usePathname();
  const route = parseRepositoryRoute(pathname.split("/").filter(Boolean));
  const isPullRequestsPage = route?.page === "pulls";
  const isDetailPage = route?.page === "pull";

  return (
    <div className="app-shell">
      <nav className="main-nav" aria-label="Main navigation">
        <RepositoryControls workspace={workspace} showTrack={!isDetailPage} />
        <Link className={!isPullRequestsPage && !isDetailPage ? "active" : ""} href={workspace.activeRepository ? repositoryUrl(workspace.activeRepository) : "/"}>
          Dashboard
        </Link>
        <Link className={isPullRequestsPage || isDetailPage ? "active" : ""} href={workspace.activeRepository ? pullsUrl(workspace.activeRepository) : "/"}>
          Pull requests
        </Link>
      </nav>
      <main className="content content-wide">
        <PinProvider pullRequests={stackPRs}>
        {isDetailPage ? (
          <PullRequestDetail pullRequests={pullRequests} prDetails={prDetails} prDiffs={prDiffs} revisions={revisions} stackPRs={stackPRs} />
        ) : isPullRequestsPage ? (
          <PullRequests pullRequests={pullRequests} />
        ) : (
          <Dashboard pullRequests={pullRequests} />
        )}
        </PinProvider>
      </main>
    </div>
  );
}

function PullRequestCard({ pullRequest }) {
  return (
    <div className="pr-card-wrapper">
    <Link className="pr-card" href={pullUrl(pullRequest.repository, pullRequest.number)}>
      <div className="pr-card-header">
        <h3><span className="pr-number">#{pullRequest.number}</span>{" "}{pullRequest.title}</h3>
      </div>
      {pullRequest.shortSummary && <p>{pullRequest.shortSummary}</p>}
      <div className="pr-card-footer">
        {pullRequest.author && <p className="pr-card-author">By {pullRequest.author}</p>}
        <ChangeStats additions={pullRequest.additions} deletions={pullRequest.deletions} />
        {pullRequest.labels?.length > 0 && <div className="labels pr-card-labels" aria-label="Labels">
          {pullRequest.labels.map((label) => <span className="label" key={label}>{label}</span>)}
        </div>}
        {pullRequest.mergeConflict && <div className="pr-card-badges"><PRStatusBadge kind="conflict">Merge conflicts</PRStatusBadge></div>}
      </div>
    </Link>
    <PinButton number={pullRequest.number} iconOnly={true} />
    </div>
  );
}

function DashboardGroup({ label, accent, items, emptyMessage }) {
  const [filters, setFilters] = useState({ query: "", author: "", label: "", ci: "", conflicts: false });
  const visible = filterPullRequests(items, filters);
  const authors = [...new Set(items.map((pr) => pr.author).filter(Boolean))].sort();
  const labels = [...new Set(items.flatMap((pr) => pr.labels ?? []))].sort();
  function change(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  return <section className="pr-group" aria-label={label}>
    <div className="group-heading"><div className="group-title"><span className={`status-dot ${accent}`} /><h2>{label}</h2><span className="count">{visible.length === items.length ? items.length : `${visible.length}/${items.length}`}</span></div>
      {items.length > 0 && <div className="dashboard-filters">
        <input type="search" aria-label={`Search ${label}`} placeholder="Title, author, or #" value={filters.query} onChange={(event) => change("query", event.target.value)} />
        <select aria-label={`Author in ${label}`} value={filters.author} onChange={(event) => change("author", event.target.value)}><option value="">All authors</option>{authors.map((author) => <option key={author}>{author}</option>)}</select>
        <select aria-label={`Label in ${label}`} value={filters.label} onChange={(event) => change("label", event.target.value)}><option value="">All labels</option>{labels.map((value) => <option key={value}>{value}</option>)}</select>
        <select aria-label={`CI in ${label}`} value={filters.ci} onChange={(event) => change("ci", event.target.value)}><option value="">All CI</option><option value="failure">Failed</option><option value="pending">Pending</option><option value="success">Passed</option><option value="none">No checks</option></select>
        <label><input type="checkbox" checked={filters.conflicts} onChange={(event) => change("conflicts", event.target.checked)} /> Conflicts</label>
        <button className="pr-pin dashboard-filters-clear" type="button" disabled={!Object.values(filters).some(Boolean)} onClick={() => setFilters({ query: "", author: "", label: "", ci: "", conflicts: false })}>Clear</button>
      </div>}
    </div>
    <div className="pr-list">{visible.length ? visible.map((pr) => <PullRequestCard key={pr.number} pullRequest={pr} />) : <p className="empty-state">{items.length ? "No PRs match these filters." : emptyMessage}</p>}</div>
  </section>;
}

function PullRequestGroups({ pullRequests }) {
  const { pins } = usePins();
  const pinned = categories.flatMap((category) => getCategoryItems(pullRequests, category)).filter((pr) => pins.has(pr.number));
  return (
    <div className="pr-groups">
      <DashboardGroup label="Pinned" accent="amber" items={pinned} emptyMessage="Pin a pull request to keep it here." />
      {categories.map((category) => {
        const items = getCategoryItems(pullRequests, category).filter((pr) => !pins.has(pr.number));

        return <DashboardGroup key={category.key} label={category.label} accent={category.accent} items={items} emptyMessage="No pull requests in this group." />;
      })}
    </div>
  );
}

function Dashboard({ pullRequests }) {
  const totalPullRequests = categories.reduce((total, category) => total + getCategoryItems(pullRequests, category).length, 0);

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Review queue</p>
          <h1>Pull requests</h1>
        </div>
        <span className="total-count">{totalPullRequests} open</span>
      </div>
      <p className="lede">A focused view of the pull requests that need your attention.</p>
      <PullRequestGroups pullRequests={pullRequests} />
    </section>
  );
}

function PullRequests({ pullRequests }) {
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>All pull requests</h1>
        </div>
      </div>
      <PullRequestGroups pullRequests={pullRequests} />
    </section>
  );
}

function PullRequestDetail({ pullRequests, prDetails, prDiffs, revisions, stackPRs }) {
  const pathname = usePathname();
  const pathSegments = pathname.split("/").filter(Boolean);
  const route = parseRepositoryRoute(pathSegments);
  const number = route?.number;
  const pullRequest = categories
    .flatMap((category) => getCategoryItems(pullRequests, category))
    .find((item) => String(item.number) === number);
  const { details: ciDetails, error: ciError } = usePRStatus(prDetails[number]);
  const [assignment, setAssignment] = useState(null);
  const [requestedReviewers, setRequestedReviewers] = useState(null);
  const [discussion, setDiscussion] = useState(null);
  const details = ciDetails ? {
    ...ciDetails,
    ...(discussion?.source === prDetails[number] ? { github: discussion.github } : {}),
    ...(assignment?.source === prDetails[number] && Date.now() < assignment.until ? { assignees: assignment.assignees } : {}),
    ...(requestedReviewers?.source === prDetails[number] && Date.now() < requestedReviewers.until ? { reviewRequests: requestedReviewers.reviewRequests } : {}),
  } : ciDetails;
  const diff = prDiffs[number];
  function onThreadUpdated(result) {
    setDiscussion((previous) => {
      const github = (previous?.source === prDetails[number] ? previous.github : prDetails[number].github) ?? { comments: [], reviews: [], inlineComments: [], threads: [] };
      return { source: prDetails[number], github: {
        ...github,
        comments: result.discussionComment ? [...(github.comments ?? []).filter((comment) => comment.id !== result.discussionComment.id), result.discussionComment] : github.comments,
        inlineComments: result.comment ? [...(github.inlineComments ?? []).filter((comment) => comment.id !== result.comment.id), result.comment] : github.inlineComments,
        threads: result.thread ? (github.threads ?? []).map((thread) => thread.id === result.thread.id ? { ...thread, ...result.thread } : thread) : github.threads,
      } };
    });
  }

  if (!pullRequest || !details) {
    return (
      <div className="empty-page">
        <p className="eyebrow">Not found</p>
        <h1>Pull request not found</h1>
        <Link className="back-link" href={pullsUrl(route.repository)}>
          ← Back to pull requests
        </Link>
      </div>
    );
  }

  return (
    <ReviewProvider key={`${details.repository}:${number}`} repository={details.repository} number={details.number} nextPR={nextStackPullRequest(getPullRequestStack(details, stackPRs), number)}>
    <ReviewChat key={`${details.repository}:${number}`} repository={details.repository} number={details.number} details={details} onThreadUpdated={onThreadUpdated}>
    <article className="pr-detail" id="top">
      <div className="detail-kicker">
        <Link className="back-link pr-header-back" href={pullsUrl(details.repository)} aria-label={`Pull request #${pullRequest.number} — back to pull requests`}>
          <span aria-hidden="true">←</span>
          <span className="eyebrow">Pull request #{pullRequest.number}</span>
        </Link>
        <div className="detail-actions">
          <PinButton number={pullRequest.number} iconOnly={false} />
          <RefreshButton repository={details.repository} number={details.number} />
          <TopReviewMenu details={details} files={diff?.files ?? []} />
          <PRHotkeys key={`${details.repository}:${number}`} stack={getPullRequestStack(details, stackPRs)} link={details.link} repository={details.repository} number={details.number} onAssigned={(result) => setAssignment({ source: prDetails[number], assignees: result.assignees, until: Date.now() + 60000 })} onReviewerRequested={(result) => setRequestedReviewers({ source: prDetails[number], reviewRequests: result.reviewRequests, until: Date.now() + 60000 })} />
        </div>
      </div>
      <h1>{details.title}</h1>
      <div className="live-pr-status" aria-label="Live pull request status">
        <span className="review-badge">{details.liveState === "MERGED" ? "Merged" : details.liveState === "CLOSED" ? "Closed" : details.liveState ? details.draft ? "Draft" : "Open" : "Loading live status…"}</span>
        {hasMergeConflict(details) ? <PRStatusBadge kind="conflict">Merge conflicts</PRStatusBadge> : details.liveState === "OPEN" && <span className="pr-merge-status">{details.mergeState === "unknown" ? "Checking mergeability…" : `Merge status: ${details.mergeState?.replaceAll("_", " ") ?? "unknown"}`}</span>}
        <PRStatusBadge kind={details.reviewRequests?.length ? "review-pending" : "review-clear"}>
          {details.reviewRequests?.length ? <><strong className="pr-status-count">{details.reviewRequests.length}</strong> {details.reviewRequests.length === 1 ? "review requested" : "reviews requested"}</> : "No outstanding reviews"}
        </PRStatusBadge>
      </div>
      {details.currentHeadSha && details.currentHeadSha !== details.headSha && <p className="revision-warning">New commits are available. Use Refresh to update the code snapshot.</p>}
      <StackNavigator stack={getPullRequestStack(details, stackPRs)} repository={details.repository} currentNumber={number} />
      <MergeReadiness details={details} />
        <section className="pr-page-section pr-info-card" id="info" aria-labelledby="info-heading">
          <h2 className="pr-section-heading" id="info-heading">Info</h2>
          <PullRequestContext details={details} onThreadUpdated={onThreadUpdated}>
          <div className="pr-info-metadata">
          {ciError && <p className="pr-refresh-error" role="status">{ciError}</p>}
          <div className="detail-grid">
            <div className="detail-stat">
              <span>Author</span>
              <strong>{details.author}</strong>
            </div>
            <div className="detail-stat">
              <span>Opened</span>
              <strong>{details.createdAt}</strong>
            </div>
            <div className="detail-stat">
              <span>Updated</span>
              <strong>{details.updatedAt}</strong>
            </div>
            <div className="detail-stat">
              <span>Review</span>
              <strong>{details.reviewDecision}</strong>
            </div>
          </div>
          <dl className="metadata-list">
            <div>
              <dt>Labels</dt>
              <dd>
                <div className="labels">
                  {details.labels.map((label) => (
                    <span className="label" key={label}>
                      {label}
                    </span>
                  ))}
                </div>
              </dd>
            </div>
            <div>
              <dt>Repository</dt>
              <dd>{details.repository}</dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>{details.branch}</dd>
            </div>
            <div>
              <dt>Base branch</dt>
              <dd>{details.baseBranch}</dd>
            </div>
            <div>
              <dt>Assignees</dt>
              <dd>{details.assignees.join(", ")}</dd>
            </div>
            <div>
              <dt>Milestone</dt>
              <dd>{details.milestone}</dd>
            </div>
            <div>
              <dt>Checks</dt>
              <dd>{details.checks}</dd>
            </div>
            <div>
              <dt>Changes</dt>
              <dd><ChangeStats additions={details.additions} deletions={details.deletions} /></dd>
            </div>
            <div>
              <dt>Files changed</dt>
              <dd>{details.filesChanged}</dd>
            </div>
          </dl>
          </div>
          </PullRequestContext>
        </section>
        <CodeTour key={`${details.repository}:${number}`} details={details} diff={diff ?? { files: [] }} revisions={revisions} />
    </article>
    </ReviewChat>
    </ReviewProvider>
  );
}

export default function App({ pullRequests, prDetails, prDiffs, revisions, stackPRs, workspace }) {
  return <Layout pullRequests={pullRequests} prDetails={prDetails} prDiffs={prDiffs} revisions={revisions} stackPRs={stackPRs} workspace={workspace} />;
}
