export default function StatusIcon({ kind, label, shape }) {
  return <span className={`status-icon status-icon-${kind}`} role="img" aria-label={label} title={label}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {shape === "approval" ? <path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z" /> : <circle cx="12" cy="12" r="9" />}
      {kind === "success" ? <path d="m7 12 3 3 7-7" /> : kind === "failure" ? <path d="m9 9 6 6m0-6-6 6" /> : kind === "pending" ? <path d="M12 6v6l4 2" /> : <path d="M8 12h8" />}
    </svg>
  </span>;
}
