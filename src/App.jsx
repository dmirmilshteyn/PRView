"use client";

import { useEffect, useState } from "react";
import { createHighlighter } from "shiki";
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

function Layout({ pullRequests, prDetails, prDiffs }) {
  const pathname = usePathname();
  const isPullRequestsPage = pathname === "/pull-requests";
  const isDetailPage = pathname.startsWith("/pull-requests/");

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">+</span>
          PRView
        </Link>
        <nav aria-label="Main navigation">
          <Link className={pathname === "/" ? "active" : ""} href="/">
            Dashboard
          </Link>
          <Link className={isPullRequestsPage || isDetailPage ? "active" : ""} href="/pull-requests">
            Pull requests
          </Link>
        </nav>
      </header>

      <main className={`content ${isDetailPage ? "content-wide" : ""}`}>
        {isDetailPage ? (
          <PullRequestDetail pullRequests={pullRequests} prDetails={prDetails} prDiffs={prDiffs} />
        ) : isPullRequestsPage ? (
          <PullRequests pullRequests={pullRequests} />
        ) : (
          <Dashboard pullRequests={pullRequests} />
        )}
      </main>
    </div>
  );
}

function PullRequestCard({ pullRequest }) {
  return (
    <Link className="pr-card" href={`/pull-requests/${pullRequest.number}`}>
      <div className="pr-card-header">
        <span className="pr-number">#{pullRequest.number}</span>
        <span className="card-arrow" aria-hidden="true">
          →
        </span>
      </div>
      <h3>{pullRequest.title}</h3>
      <p>{pullRequest.description}</p>
    </Link>
  );
}

function PullRequestGroups({ pullRequests }) {
  return (
    <div className="pr-groups">
      {categories.map((category) => {
        const items = getCategoryItems(pullRequests, category);

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

function PullRequestDetail({ pullRequests, prDetails, prDiffs }) {
  const pathname = usePathname();
  const number = pathname.split("/").pop();
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
    <article className="pr-detail">
      <Link className="back-link" href="/pull-requests">
        ← Back to pull requests
      </Link>
      <p className="eyebrow">Pull request #{pullRequest.number}</p>
      <h1>{details.title}</h1>
      <p className="detail-description">{details.description}</p>
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
      <div className="detail-section">
        <h2>Labels</h2>
        <div className="labels">
          {details.labels.map((label) => (
            <span className="label" key={label}>
              {label}
            </span>
          ))}
        </div>
      </div>
      <dl className="metadata-list">
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
          <dd>+{details.additions} / −{details.deletions}</dd>
        </div>
        <div>
          <dt>Files changed</dt>
          <dd>{details.filesChanged}</dd>
        </div>
      </dl>
      <DiffViewer diff={diff} />
    </article>
  );
}

function DiffViewer({ diff }) {
  const [reviewedFiles, setReviewedFiles] = useState({});
  const [collapsedFiles, setCollapsedFiles] = useState({});

  function setFileReviewed(path, reviewed) {
    setReviewedFiles((current) => ({ ...current, [path]: reviewed }));
    setCollapsedFiles((current) => ({ ...current, [path]: reviewed }));
  }

  function toggleFileCollapsed(path) {
    setCollapsedFiles((current) => ({ ...current, [path]: !current[path] }));
  }

  return (
    <section className="diff-section">
      <div className="diff-heading">
        <div>
          <p className="eyebrow">Changes</p>
          <h2>Files changed</h2>
        </div>
        <span className="total-count">{diff.files.length} file{diff.files.length === 1 ? "" : "s"}</span>
      </div>
      <div className="diff-files">
        {diff.files.map((file) => (
          <article className="diff-file" key={file.path}>
            <header
              className="diff-file-header"
              role="button"
              tabIndex={0}
              aria-expanded={!(collapsedFiles[file.path] ?? false)}
              onClick={() => toggleFileCollapsed(file.path)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleFileCollapsed(file.path);
                }
              }}
            >
              <span className="file-path">{file.path}</span>
              <div className="file-actions">
                <span className="file-stats">
                  <span className="additions">+{file.additions}</span>
                  <span className="deletions">−{file.deletions}</span>
                </span>
                <label className="reviewed-toggle" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={reviewedFiles[file.path] ?? false}
                    onChange={(event) => setFileReviewed(file.path, event.target.checked)}
                  />
                  <span>Reviewed</span>
                </label>
              </div>
            </header>
            {!collapsedFiles[file.path] &&
              file.hunks.map((hunk) => (
                <div className="diff-hunk" key={hunk.header}>
                  <div className="hunk-header">{hunk.header}</div>
                  <HighlightedDiffHunk filePath={file.path} lines={hunk.lines} />
                </div>
              ))}
          </article>
        ))}
      </div>
    </section>
  );
}

function HighlightedDiffHunk({ filePath, lines }) {
  const [highlightedLines, setHighlightedLines] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      const highlighter = await createHighlighter({
        themes: ["github-dark"],
        langs: ["javascript", "jsx", "typescript", "tsx", "json", "css", "markdown", "bash", "text"],
      });
      const source = lines
        .map((line) => (line[0] === "+" || line[0] === "-" ? line.slice(1) : line))
        .join("\n");
      const language = getLanguage(filePath);
      const tokens = highlighter.codeToTokens(source, { lang: language, theme: "github-dark" }).tokens;

      if (!cancelled) {
        setHighlightedLines(tokens);
      }

      highlighter.dispose();
    }

    highlight();

    return () => {
      cancelled = true;
    };
  }, [filePath, lines]);

  return (
    <pre>
      {lines.map((line, index) => {
        const marker = line[0] === "+" || line[0] === "-" ? line[0] : " ";
        const lineClass = marker === "+" ? "added" : marker === "-" ? "removed" : "context";
        const tokens = highlightedLines?.[index] ?? [{ content: marker === " " ? line : line.slice(1) }];

        return (
          <code className={`diff-line ${lineClass}`} key={`${filePath}-${index}`}>
            <span className="line-marker">{marker}</span>
            {tokens.map((token, tokenIndex) => (
              <span key={`${filePath}-${index}-${tokenIndex}`} style={{ color: token.color }}>
                {token.content}
              </span>
            ))}
            {"\n"}
          </code>
        );
      })}
    </pre>
  );
}

function getLanguage(filePath) {
  const extension = filePath.split(".").pop();
  const languages = {
    css: "css",
    md: "markdown",
    json: "json",
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
  };

  return languages[extension] ?? "text";
}

export default function App({ pullRequests, prDetails, prDiffs }) {
  return <Layout pullRequests={pullRequests} prDetails={prDetails} prDiffs={prDiffs} />;
}
