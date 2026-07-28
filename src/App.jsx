import { Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import pullRequests from "../artifacts/prs.json";

const prDetails = import.meta.glob("../artifacts/pr/*/details.json", {
  eager: true,
  import: "default",
});

const categories = [
  { key: "needsReview", label: "Needs review", accent: "amber" },
  { key: "inProgress", label: "In progress", accent: "blue" },
  { key: "readyToMerge", label: "Ready to merge", accent: "green" },
];

function Layout() {
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark">+</span>
          PRView
        </Link>
        <nav aria-label="Main navigation">
          <Link className={location.pathname === "/" ? "active" : ""} to="/">
            Dashboard
          </Link>
          <Link className={location.pathname === "/pull-requests" ? "active" : ""} to="/pull-requests">
            Pull requests
          </Link>
        </nav>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pull-requests" element={<PullRequests />} />
          <Route path="/pull-requests/:number" element={<PullRequestDetail />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

function PullRequestCard({ pullRequest }) {
  return (
    <Link className="pr-card" to={`/pull-requests/${pullRequest.number}`}>
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

function PullRequestGroups() {
  return (
    <div className="pr-groups">
      {categories.map((category) => {
        const items = pullRequests[category.key] ?? [];

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

function Dashboard() {
  const totalPullRequests = categories.reduce((total, category) => total + (pullRequests[category.key]?.length ?? 0), 0);

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
      <PullRequestGroups />
    </section>
  );
}

function PullRequests() {
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>All pull requests</h1>
        </div>
      </div>
      <PullRequestGroups />
    </section>
  );
}

function PullRequestDetail() {
  const { number } = useParams();
  const pullRequest = categories
    .flatMap((category) => pullRequests[category.key] ?? [])
    .find((item) => String(item.number) === number);
  const details = prDetails[`../artifacts/pr/${number}/details.json`];

  if (!pullRequest || !details) {
    return <Navigate replace to="/pull-requests" />;
  }

  return (
    <article className="pr-detail">
      <Link className="back-link" to="/pull-requests">
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
    </article>
  );
}

export default function App() {
  return <Layout />;
}
