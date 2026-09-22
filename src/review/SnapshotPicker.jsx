import { useState } from "react";
import Modal from "./Modal.jsx";

export default function SnapshotPicker({ revisions, currentRevision, viewedRevision, baselineRevision, lastReviewRevision, sinceReview, onApply, onClose }) {
  const [snapshot, setSnapshot] = useState(viewedRevision);
  const [baseline, setBaseline] = useState(baselineRevision ?? "");
  const [compare, setCompare] = useState(sinceReview);
  const entries = Object.entries(revisions).sort(([a, first], [b, second]) => {
    if (a === currentRevision) { return -1; }
    if (b === currentRevision) { return 1; }
    return (second.details.syncedAt ?? "").localeCompare(first.details.syncedAt ?? "");
  });
  const available = Boolean(revisions[baseline]);
  const same = snapshot === baseline;

  function options(role, selected, onChange) {
    return entries.map(([revision, value]) => <label className={`snapshot-choice ${selected === revision ? "is-selected" : ""}`} key={revision}>
      <input type="radio" name={role} value={revision} checked={selected === revision} onChange={() => onChange(revision)} />
      <span className="snapshot-choice-body">
        <span className="snapshot-choice-title"><code>{revision.slice(0, 8)}</code>{revision === currentRevision && <span className="snapshot-tag">Current</span>}{revision === lastReviewRevision && <span className="snapshot-tag is-reviewed">Last reviewed</span>}</span>
        <small>{value.details.syncedAt ? new Date(value.details.syncedAt).toLocaleString() : "Imported snapshot"}</small>
        <small>{value.diff.files.length} changed {value.diff.files.length === 1 ? "file" : "files"}</small>
      </span>
    </label>);
  }

  return <Modal title="Choose your comparison" onClose={onClose}>
    <div className="snapshot-picker">
      <p className="snapshot-intro">Choose the code you want to read, then where your comparison starts.</p>
      <div className="snapshot-columns">
        <fieldset><legend><span>1</span> Snapshot to view</legend><p>The PR version you’ll read and comment on.</p>
          <button type="button" className="snapshot-shortcut" onClick={() => setSnapshot(currentRevision)}>Use current snapshot</button>
          <div className="snapshot-list">{options("snapshot", snapshot, setSnapshot)}</div>
        </fieldset>
        <fieldset><legend><span>2</span> Review baseline</legend><p>An earlier version to compare it against.</p>
          <button type="button" className="snapshot-shortcut" disabled={!revisions[lastReviewRevision]} onClick={() => { setBaseline(lastReviewRevision); setCompare(true); }}>Use last submitted review</button>
          {!lastReviewRevision && <small className="snapshot-hint">No submitted review yet. Pick a saved snapshot.</small>}
          {baseline && !available && <p className="snapshot-hint" role="status">Baseline {baseline.slice(0, 8)} is unavailable locally. Choose a saved snapshot below.</p>}
          <div className="snapshot-list">{options("baseline", baseline, (value) => { setBaseline(value); setCompare(true); })}</div>
        </fieldset>
      </div>
      <div className="snapshot-preview">
        <label><input type="checkbox" checked={compare} disabled={!available} onChange={(event) => setCompare(event.target.checked)} /> Show only changes since the baseline</label>
        <p aria-live="polite">{compare && available ? <><code>{baseline.slice(0, 8)}</code><span aria-hidden="true"> → </span><code>{snapshot.slice(0, 8)}</code><span> · {same ? "Same snapshot — no changes to show." : "Changes between these two snapshots."}</span></> : <>Full PR diff at <code>{snapshot.slice(0, 8)}</code>, compared with the PR’s base.</>}</p>
      </div>
      <div className="snapshot-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="snapshot-apply" onClick={() => onApply({ snapshot, baseline, compare: compare && available })}>Apply comparison</button></div>
    </div>
  </Modal>;
}
