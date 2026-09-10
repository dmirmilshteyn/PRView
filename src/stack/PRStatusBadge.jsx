export default function PRStatusBadge({ kind, children }) {
  return <span className={`pr-status-badge ${kind}`}>
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {kind === "conflict" ? <><path d="m8 2 6 11H2L8 2Z" /><path d="M8 6v3m0 2h.01" /></> : <><path d="M3 2h10v9H8l-4 3v-3H3V2Z" /><path d="M6 5h4M6 8h3" /></>}
    </svg>
    {children}
  </span>;
}
