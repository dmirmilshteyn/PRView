export default function StackSignal({ label, kind, description }) {
  return <span className={`stack-signal ${kind}`} title={description} aria-label={description}>
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="m5 8 2 2 4-4" />
    </svg><span>{label}</span>
  </span>;
}
