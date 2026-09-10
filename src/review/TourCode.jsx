import { useState } from "react";
import { useLocalReview } from "./ReviewProvider.jsx";
import { draftKey } from "./state.js";
import { newDraft } from "./NoteThreads.jsx";
import DiffFile from "./DiffFile.jsx";

export default function TourCode({ reference, revision, file, onOpenCode }) {
  const { state, ready, status, error, update, retry } = useLocalReview();
  const [view, setView] = useState({ context: 3, full: false, fullSide: reference.side });
  const draft = state.drafts[draftKey(revision, reference.path)] ?? newDraft();
  function onDraft(value) {
    update({ type: "draft", filePath: reference.path, revision, draft: value });
  }
  if (!file) {
    return <p className="review-muted">The diff for this reference is unavailable. Refresh the PR to load its snapshot.</p>;
  }
  if (!ready) {
    return <p className="review-muted">Loading review state…</p>;
  }
  return <>
    <DiffFile file={file} focusRange={reference} split={state.preferences.split ?? false} ignoreWhitespace={false}
      selection={draft.anchor} anchorRevision={revision} leftRevision={revision} view={view} onView={setView}
      notes={state.notes.filter((note) => note.filePath === reference.path)} draft={draft} onDraft={onDraft}
      onUpdate={update} onCancel={() => onDraft(newDraft())}
      onJump={(note) => onOpenCode({ path: reference.path, ...(note.anchor ?? reference) })}
      onSelect={(anchor) => onDraft({ ...draft, open: true, anchor: { ...anchor, sourceSide: anchor.side } })} />
    {status !== "Saved" && <p className="review-muted" role="status">{status}</p>}
    {error && <p role="alert">{error} <button type="button" onClick={retry}>Retry saving</button></p>}
  </>;
}
