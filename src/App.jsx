import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";

function Layout() {
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
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

function Dashboard() {
  return (
    <section>
      <p className="eyebrow">Welcome back</p>
      <h1>Review with confidence.</h1>
      <p className="lede">Your pull request workspace is ready. Choose a view to get started.</p>
      <Link className="button" to="/pull-requests">
        View pull requests
      </Link>
    </section>
  );
}

function PullRequests() {
  return (
    <section>
      <p className="eyebrow">Workspace</p>
      <h1>Pull requests</h1>
      <p className="lede">This is the starting point for your review queue.</p>
    </section>
  );
}

export default function App() {
  return <Layout />;
}
