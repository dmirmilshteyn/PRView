"use client";

import CodeTour from "./review/CodeTour.jsx";
import ChangeStats from "./review/ChangeStats.jsx";
import ReviewProvider from "./review/ReviewProvider.jsx";
import PinProvider, { usePins } from "./review/PinProvider.jsx";
import PinButton from "./review/PinButton.jsx";
import RefreshButton from "./review/RefreshButton.jsx";
import ReviewChat from "./review/ReviewChat.jsx";
import PullRequestContext from "./review/PullRequestContext.jsx";
import StackNavigator from "./stack/StackNavigator.jsx";
import { getPullRequestStack } from "./stack/stack.js";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

function Layout({ pullRequests, prDetails, prDiffs, revisions, stackPRs }) {
  const pathname = usePathname();
  const isPullRequestsPage = pathname === "/pull-requests";
  const isDetailPage = pathname.startsWith("/pull-requests/");

  return (
    <div className="app-shell">
      <nav className="main-nav" aria-label="Main navigation">
        <Link className={pathname === "/" ? "active" : ""} href="/">
          Dashboard
        </Link>
        <Link className={isPullRequestsPage || isDetailPage ? "active" : ""} href="/pull-requests">
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
    <Link className="pr-card" href={`/pull-requests/${pullRequest.number}`}>
      <div className="pr-card-header">
        <span className="pr-number">#{pullRequest.number}</span>
        <span className="card-arrow" aria-hidden="true">
          →
        </span>
      </div>
      <h3>{pullRequest.title}</h3>
      {pullRequest.shortSummary && <p>{pullRequest.shortSummary}</p>}
      <ChangeStats additions={pullRequest.additions} deletions={pullRequest.deletions} />
    </Link>
    <PinButton number={pullRequest.number} />
    </div>
  );
}

function PullRequestGroups({ pullRequests }) {
  const { pins } = usePins();
  const pinned = categories.flatMap((category) => getCategoryItems(pullRequests, category)).filter((pr) => pins.has(pr.number));
  return (
    <div className="pr-groups">
      <section className="pr-group pinned-prs" aria-labelledby="pinned-heading">
        <div className="group-heading"><div className="group-title"><span className="status-dot amber" /><h2 id="pinned-heading">Pinned</h2><span className="count">{pinned.length}</span></div></div>
        <div className="pr-list">{pinned.length ? pinned.map((pr) => <PullRequestCard key={pr.number} pullRequest={pr} />) : <p className="empty-state">Pin a pull request to keep it here.</p>}</div>
      </section>
      {categories.map((category) => {
        const items = getCategoryItems(pullRequests, category).filter((pr) => !pins.has(pr.number));

        return (
          <section className="pr-group" key={category.key}>
            <div className="group-heading">
              <div className="group-title">
                <span className={`status-dot ${category.accent}`} />
                <h2>{category.label}</h2>
                <span className="count">{items.length}</span>
              </div>
            </div>
            <div className="pr-list">
              {items.length > 0 ? (
                items.map((pullRequest) => <PullRequestCard key={pullRequest.number} pullRequest={pullRequest} />)
              ) : (
                <p className="empty-state">No pull requests in this group.</p>
              )}
            </div>
          </section>
        );
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
  const number = pathSegments[1];
  const pullRequest = categories
    .flatMap((category) => getCategoryItems(pullRequests, category))
    .find((item) => String(item.number) === number);
  const details = prDetails[number];
  const diff = prDiffs[number];

  if (!pullRequest || !details) {
    return (
      <div className="empty-page">
        <p className="eyebrow">Not found</p>
        <h1>Pull request not found</h1>
        <Link className="back-link" href="/pull-requests">
          ← Back to pull requests
        </Link>
      </div>
    );
  }

  return (
    <ReviewProvider key={`${details.repository}:${number}`} repository={details.repository} number={details.number}>
    <ReviewChat key={`${details.repository}:${number}`} repository={details.repository} number={details.number}>
    <article className="pr-detail">
      <div className="detail-kicker">
        <Link className="back-link" href="/pull-requests" aria-label="Back to pull requests">
          ←
        </Link>
        <p className="eyebrow">Pull request #{pullRequest.number}</p>
        <div className="detail-actions">
          <PinButton number={pullRequest.number} />
          <RefreshButton repository={details.repository} number={details.number} />
        </div>
      </div>
      <h1>{details.title}</h1>
      <StackNavigator stack={getPullRequestStack(details, stackPRs)} repository={details.repository} currentNumber={number} />
        <section className="pr-page-section pr-info-card" id="info" aria-labelledby="info-heading">
          <h2 className="pr-section-heading" id="info-heading">Info</h2>
          <PullRequestContext details={details} />
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
        </section>
        <CodeTour key={`${details.repository}:${number}`} details={details} diff={diff ?? { files: [] }} revisions={revisions} />
    </article>
    </ReviewChat>
    </ReviewProvider>
  );
}

export default function App({ pullRequests, prDetails, prDiffs, revisions, stackPRs }) {
  return <Layout pullRequests={pullRequests} prDetails={prDetails} prDiffs={prDiffs} revisions={revisions} stackPRs={stackPRs} />;
}
