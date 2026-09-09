import { useState } from "react";
import { useLocalReview } from "./ReviewProvider.jsx";

export default function FinalReview({ revision, currentRevision, reviewedCount, fileCount }) {
  const { state, status, error, update, retry } = useLocalReview();
  const [submittedId, setSubmittedId] = useState(null);
  const draft = state.reviewDrafts?.[revision] ?? { body: "", event: "COMMENT" };
  const options = [
    { event: "COMMENT", label: "Comment", description: "Leave review feedback.", icon: "◇" },
    { event: "REQUEST_CHANGES", label: "Request changes", description: "Describe what needs to change.", icon: "↻" },
    { event: "APPROVE", label: "Approve", description: "Mark your review as approved.", icon: "✓" },
  ];

  function changeDraft(value) {
    setSubmittedId(null);
    update({ type: "reviewDraft", revision, draft: value });
  }

  function submit(event) {
    event.preventDefault();
    if (status !== "Saved" || (draft.event !== "APPROVE" && !draft.body.trim())) {
      return;
    }
    const id = crypto.randomUUID();
    update({ type: "finalReview", review: { id, revision, event: draft.event, body: draft.body.trim(), source: "local", createdAt: new Date().toISOString() } });
    setSubmittedId(id);
  }

  return <form className="final-review" aria-labelledby="final-review-heading" onSubmit={submit}>
    <div className="context-heading"><h2 id="final-review-heading">Finish your review</h2><span className="review-muted">{reviewedCount} of {fileCount} files reviewed</span></div>
    <p className="review-muted">Add your review to the PR discussion.</p>
    {revision !== currentRevision && <p className="revision-warning">Reviewing an earlier snapshot: {revision.slice(0, 8)}.</p>}
    <fieldset className="final-review-options"><legend className="stack-sr-only">Review action</legend>
      {options.map((option) => <label key={option.event} className={`final-review-option ${option.event.toLowerCase()} ${draft.event === option.event ? "selected" : ""}`}>
        <input type="radio" name="review-action" value={option.event} checked={draft.event === option.event} onChange={() => changeDraft({ ...draft, event: option.event })} />
        <span className="final-review-icon" aria-hidden="true">{option.icon}</span><span><strong>{option.label}</strong><small>{option.description}</small></span>
      </label>)}
    </fieldset>
    <label className="final-review-body">Review summary {draft.event === "APPROVE" && <span className="review-muted">(optional)</span>}
      <textarea aria-label="Review summary" placeholder={draft.event === "REQUEST_CHANGES" ? "What needs to change before this is ready?" : "Summarize your review… (Markdown supported)"} maxLength={10000} required={draft.event !== "APPROVE"} value={draft.body} onChange={(event) => changeDraft({ ...draft, body: event.target.value })} />
    </label>
    <div className="final-review-footer"><button className={`final-review-submit ${draft.event.toLowerCase()}`} type="submit" disabled={status !== "Saved" || (draft.event !== "APPROVE" && !draft.body.trim())}>{draft.event === "APPROVE" ? "Approve" : draft.event === "REQUEST_CHANGES" ? "Request changes" : "Save comment"}</button></div>
    {error ? <p role="alert">Your review changes have not been saved: {error} <button type="button" onClick={retry}>Retry saving review</button></p> : <p className="final-review-status" role="status">{submittedId && status === "Saved" ? <>Review saved. <a href={`#local-review-${submittedId}`}>View in PR discussion ↑</a></> : status}</p>}
  </form>;
}
