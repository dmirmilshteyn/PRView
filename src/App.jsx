"use client";

import { useEffect, useRef, useState } from "react";
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
      <nav className="main-nav" aria-label="Main navigation">
        <Link className={pathname === "/" ? "active" : ""} href="/">
          Dashboard
        </Link>
        <Link className={isPullRequestsPage || isDetailPage ? "active" : ""} href="/pull-requests">
          Pull requests
        </Link>
      </nav>
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
    <Link className="pr-card" href={`/pull-requests/${pullRequest.number}/info`}>
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
  const pathSegments = pathname.split("/").filter(Boolean);
  const number = pathSegments[1];
  const activeTab = pathSegments[2] === "code" ? "code" : "info";
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
      <div className="detail-kicker">
        <Link className="back-link" href="/pull-requests" aria-label="Back to pull requests">
          ←
        </Link>
        <p className="eyebrow">Pull request #{pullRequest.number}</p>
      </div>
      <h1>{details.title}</h1>
      <p className="detail-description">{details.description}</p>
      <div className="detail-tabs" role="tablist" aria-label="Pull request details">
        <Link
          className={activeTab === "info" ? "active" : ""}
          href={`/pull-requests/${number}/info`}
          id="info-tab"
          role="tab"
          aria-selected={activeTab === "info"}
          aria-controls="info-panel"
        >
          Info
        </Link>
        <Link
          className={activeTab === "code" ? "active" : ""}
          href={`/pull-requests/${number}/code`}
          id="code-tab"
          role="tab"
          aria-selected={activeTab === "code"}
          aria-controls="code-panel"
        >
          Code
        </Link>
      </div>
      {activeTab === "info" ? (
        <div id="info-panel" role="tabpanel" aria-labelledby="info-tab">
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
              <dd>+{details.additions} / −{details.deletions}</dd>
            </div>
            <div>
              <dt>Files changed</dt>
              <dd>{details.filesChanged}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div id="code-panel" role="tabpanel" aria-labelledby="code-tab">
          <DiffViewer diff={diff} pullRequestNumber={pullRequest.number} />
        </div>
      )}
    </article>
  );
}

function SidebarTabs({ sidebarOpen, onToggleSidebar }) {
  return (
    <div className="sidebar-tabs" role="tablist" aria-label="Code navigation tabs">
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={sidebarOpen ? "Hide files sidebar" : "Show files sidebar"}
        aria-expanded={sidebarOpen}
        onClick={onToggleSidebar}
      >
        ◧
      </button>
      <button className="active" role="tab" aria-selected="true">
        Files
      </button>
      <button className="sidebar-tab-disabled" disabled role="tab" aria-selected="false">
        Tour
      </button>
    </div>
  );
}

function FileSidebar({ files, selectedFile, onSelectFile }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFiles = files.filter((file) => file.path.toLowerCase().includes(normalizedQuery));

  return (
    <aside className="diff-sidebar" aria-label="Code navigation">
      <div className="file-tree" role="tabpanel">
        <label className="file-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label="Search changed files"
            placeholder="Search files"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="file-tree-root">⌁ <span>Changed files</span></div>
        {visibleFiles.map((file) => (
          <button
            className={`file-tree-item ${selectedFile === file.path ? "active" : ""}`}
            key={file.path}
            onClick={() => onSelectFile(file.path, files.indexOf(file))}
          >
            <span className="file-tree-icon">▱</span>
            <span className="file-tree-name">{file.path}</span>
            <span className="file-tree-stats">
              <span className="additions">+{file.additions}</span>
              {file.deletions > 0 && <span className="deletions"> −{file.deletions}</span>}
            </span>
          </button>
        ))}
        {visibleFiles.length === 0 && <p className="file-tree-empty">No matching files.</p>}
      </div>
    </aside>
  );
}

function formatCommentDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function CommentComposer({ filePath, draft, submitting, onToggle, onDraftChange, onSubmit }) {
  return (
    <div className="comment-composer">
      <div className="comment-composer-header">
        <span>⌄ &nbsp;Draft thread on file</span>
        <button type="button" onClick={onToggle}>
          × Discard
        </button>
      </div>
      <div className="comment-composer-body">
        <textarea
          aria-label={`Comment on ${filePath}`}
          placeholder="Write a comment..."
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <div className="comment-composer-footer">
          <span className="comment-tools">⌕ &nbsp;⊞</span>
          <button type="button" disabled={submitting || !draft.trim()} onClick={onSubmit}>
            {submitting ? "Posting..." : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentThread({ comments, pullRequestNumber, filePath, onCommentAdded }) {
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const replyInputRef = useRef(null);

  useEffect(() => {
    if (replyOpen) {
      replyInputRef.current?.focus();
    }
  }, [replyOpen]);

  if (comments.length === 0) {
    return null;
  }

  async function submitReply() {
    const body = reply.trim();

    if (!body) {
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pullRequestNumber,
        filePath,
        body,
        parentId: comments[comments.length - 1].id,
      }),
    });

    if (response.ok) {
      onCommentAdded(await response.json());
      setReply("");
    }

    setSubmitting(false);
  }

  return (
    <div className="comment-thread">
      {comments.map((comment) => (
        <div className="file-comment" key={comment.id}>
          <div className="file-comment-meta">
            <strong>{comment.author}</strong>
            <span>{formatCommentDate(comment.createdAt)}</span>
          </div>
          <p>{comment.body}</p>
        </div>
      ))}
      <div className="reply-block">
        <span className="comment-avatar" aria-hidden="true">Y</span>
        {!replyOpen ? (
          <button className="reply-preview" type="button" onClick={() => setReplyOpen(true)}>
            Reply
          </button>
        ) : (
          <div
            className="reply-editor"
            onBlur={(event) => {
              const composer = event.currentTarget;

              setTimeout(() => {
                if (!reply.trim() && !composer.contains(document.activeElement)) {
                  setReplyOpen(false);
                }
              }, 0);
            }}
          >
            <textarea
              ref={replyInputRef}
              aria-label={`Reply to comments on ${filePath}`}
              placeholder="Reply"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
            />
            <div className="reply-toolbar">
              <label className="review-checkbox" onMouseDown={(event) => event.preventDefault()}>
                <input type="checkbox" />
                <span>Add to review</span>
              </label>
              <button
                className="reply-submit"
                type="button"
                aria-label="Post reply"
                disabled={submitting || !reply.trim()}
                onClick={submitReply}
              >
                ↑
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FileCommentThread({
  filePath,
  comments,
  pullRequestNumber,
  commentOpen,
  draft,
  submitting,
  onToggle,
  onDraftChange,
  onSubmit,
  onCommentAdded,
}) {
  const fileComments = comments.filter((comment) => comment.filePath === filePath);

  if (!commentOpen && fileComments.length === 0) {
    return null;
  }

  return (
    <div className="file-comments">
      <CommentThread
        comments={fileComments}
        pullRequestNumber={pullRequestNumber}
        filePath={filePath}
        onCommentAdded={onCommentAdded}
      />
      {commentOpen && (
        <CommentComposer
          filePath={filePath}
          draft={draft}
          submitting={submitting}
          onToggle={onToggle}
          onDraftChange={onDraftChange}
          onSubmit={onSubmit}
        />
      )}
    </div>
  );
}

function DiffViewer({ diff, pullRequestNumber }) {
  const [reviewedFiles, setReviewedFiles] = useState({});
  const [collapsedFiles, setCollapsedFiles] = useState({});
  const [selectedFile, setSelectedFile] = useState(diff.files[0]?.path ?? null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [comments, setComments] = useState([]);
  const [draftComments, setDraftComments] = useState({});
  const [submittingFile, setSubmittingFile] = useState(null);
  const [commentOpenFiles, setCommentOpenFiles] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      const response = await fetch(`/api/comments?pr=${pullRequestNumber}`);

      if (response.ok && !cancelled) {
        setComments(await response.json());
      }
    }

    loadComments();

    return () => {
      cancelled = true;
    };
  }, [pullRequestNumber]);

  function setFileReviewed(path, reviewed) {
    setReviewedFiles((current) => ({ ...current, [path]: reviewed }));
    setCollapsedFiles((current) => ({ ...current, [path]: reviewed }));
  }

  function toggleFileCollapsed(path) {
    setCollapsedFiles((current) => ({ ...current, [path]: !current[path] }));
  }

  function selectFile(path, index) {
    setSelectedFile(path);
    document.getElementById(`diff-file-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleCommentComposer(path) {
    setCommentOpenFiles((current) => ({ ...current, [path]: !current[path] }));
  }

  async function submitComment(path) {
    const body = draftComments[path]?.trim();

    if (!body) {
      return;
    }

    setSubmittingFile(path);
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pullRequestNumber, filePath: path, body }),
    });

    if (response.ok) {
      const comment = await response.json();
      setComments((current) => [...current, comment]);
      setDraftComments((current) => ({ ...current, [path]: "" }));
    }

    setSubmittingFile(null);
  }

  return (
    <section className="diff-section">
      <SidebarTabs sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((current) => !current)} />
      <div className={`diff-layout ${sidebarOpen ? "" : "sidebar-hidden"}`}>
        {sidebarOpen && (
          <FileSidebar
            files={diff.files}
            selectedFile={selectedFile}
            onSelectFile={selectFile}
            onToggleSidebar={() => setSidebarOpen(false)}
          />
        )}
        <div className="diff-files">
          {diff.files.map((file, index) => (
          <article className={`diff-file ${selectedFile === file.path ? "selected" : ""}`} id={`diff-file-${index}`} key={file.path}>
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
                <button
                  className="file-comment-toggle"
                  type="button"
                  aria-label={`Comment on ${file.path}`}
                  aria-expanded={commentOpenFiles[file.path] ?? false}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCommentComposer(file.path);
                  }}
                >
                  +
                </button>
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
            <FileCommentThread
              filePath={file.path}
              comments={comments}
              pullRequestNumber={pullRequestNumber}
              commentOpen={commentOpenFiles[file.path] ?? false}
              draft={draftComments[file.path] ?? ""}
              submitting={submittingFile === file.path}
              onToggle={() => toggleCommentComposer(file.path)}
              onDraftChange={(body) => setDraftComments((current) => ({ ...current, [file.path]: body }))}
              onSubmit={() => submitComment(file.path)}
              onCommentAdded={(comment) => setComments((current) => [...current, comment])}
            />
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
