export default function GitHubLink({ href, label }) {
  return <a className="github-icon-link" href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}>
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3h7v7M21 3l-11 11M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
    </svg>
  </a>;
}
