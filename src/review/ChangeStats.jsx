export default function ChangeStats({ additions, deletions }) {
  if (!Number.isFinite(additions) || !Number.isFinite(deletions) || additions < 0 || deletions < 0) {
    return <span className="review-muted">Changes unavailable</span>;
  }
  const total = additions + deletions;
  return <span className="change-stats" role="img" aria-label={`${additions} lines added, ${deletions} lines deleted`} title={`${additions.toLocaleString()} additions · ${deletions.toLocaleString()} deletions`}>
    <span className="change-added" aria-hidden="true">+{additions.toLocaleString()}</span>
    <span className="change-deleted" aria-hidden="true">−{deletions.toLocaleString()}</span>
    <span className="change-bar" aria-hidden="true">
      {total > 0 && <><span className="change-bar-added" style={{ width: `${additions / total * 100}%` }} /><span className="change-bar-deleted" style={{ width: `${deletions / total * 100}%` }} /></>}
    </span>
  </span>;
}
