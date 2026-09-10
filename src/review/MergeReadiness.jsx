import { mergeReadiness } from "./merge-readiness.js";

export default function MergeReadiness({ details }) {
  const { rows, summary } = mergeReadiness(details);
  return <details className="merge-readiness">
    <summary><strong>Merge readiness</strong><span className="review-badge">{summary}</span><span className="readiness-summary-items">{rows.filter((row) => row.status !== "pass").map((row) => <span key={row.label} className={`readiness-summary-item ${row.status}`}>{row.status === "attention" ? "!" : "?"} {row.label}</span>)}</span></summary>
    <ul>{rows.map((row) => <li key={row.label} className={`readiness-item ${row.status}`}>
      <span className="readiness-icon" aria-label={row.status === "pass" ? "Passed" : row.status === "attention" ? "Needs attention" : "Unknown"}>{row.status === "pass" ? "✓" : row.status === "attention" ? "!" : "?"}</span>
      <div><strong>{row.label}</strong>{row.saved && <small>Saved snapshot</small>}<p>{row.detail}</p></div>
    </li>)}</ul>
    <p className="review-muted">Approvals and threads reflect the last Refresh. Outstanding requests and optional checks may not block merging; GitHub enforces the repository’s final merge rules.</p>
  </details>;
}
