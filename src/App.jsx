import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import pullRequests from "../prs.json";

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
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

function PullRequestCard({ pullRequest }) {
  return (
    <a className="pr-card" href={pullRequest.link} target="_blank" rel="noreferrer">
      <div className="pr-card-header">
        <span className="pr-number">#{pullRequest.number}</span>
        <span className="external-link" aria-hidden="true">
          ↗
        </span>
      </div>
      <h3>{pullRequest.title}</h3>
      <p>{pullRequest.description}</p>
    </a>
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

export default function App() {
  return <Layout />;
}
