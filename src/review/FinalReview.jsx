import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pullUrl } from "../routes.js";
import { useLocalReview } from "./ReviewProvider.jsx";
import ReviewSubmissionPreview from "./ReviewSubmissionPreview.jsx";

export default function FinalReview({ revision, currentRevision, reviewedCount, fileCount }) {
  const formId = useId();
  const { state, status, error, update, retry, nextPR, repository, number } = useLocalReview();
  const router = useRouter();
  const navigated = useRef(null);
  const [submittedId, setSubmittedId] = useState(null);
  const [previewReview, setPreviewReview] = useState(null);
  const draft = state.reviewDrafts?.[revision] ?? { body: "", event: "COMMENT" };
  const pendingReview = state.reviews?.find((review) => review.github && !["submitted", "cancelled"].includes(review.github.status));
  const submittedReview = state.reviews?.find((review) => review.id === submittedId);
  useEffect(() => {
    if (!submittedId || status !== "Saved" || error || !nextPR || navigated.current === submittedId) {
      return;
    }
    if (state.reviews?.some((review) => review.id === submittedId && review.event === "APPROVE" && review.github?.status === "submitted")) {
      navigated.current = submittedId;
      router.push(`${pullUrl(repository, nextPR.number)}#top`, { scroll: true });
    }
  }, [submittedId, status, error, nextPR, state.reviews, router, repository]);
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
    if (status !== "Saved" || pendingReview || (draft.event !== "APPROVE" && !draft.body.trim())) {
      return;
    }
    setPreviewReview({ id: crypto.randomUUID(), revision, event: draft.event, body: draft.body.trim(), source: "local", createdAt: new Date().toISOString() });
  }

  return <form className="final-review" aria-labelledby={`${formId}-heading`} onSubmit={submit}>
    {previewReview && <ReviewSubmissionPreview repository={repository} number={number} review={previewReview} onClose={() => setPreviewReview(null)} onConfirm={(previewToken) => {
      update({ type: "finalReview", review: previewReview, previewToken });
      setSubmittedId(previewReview.id);
      setPreviewReview(null);
    }} />}
    <div className="context-heading"><h2 id={`${formId}-heading`}>Finish your review</h2><span className="review-muted">{reviewedCount} of {fileCount} files reviewed</span></div>
    <p className="review-muted">Save locally and submit to GitHub, including saved, unresolved file and line comments that have not been submitted yet.</p>
    {revision !== currentRevision && <p className="revision-warning">Reviewing an earlier snapshot: {revision.slice(0, 8)}.</p>}
    <fieldset className="final-review-options" disabled={status !== "Saved" || Boolean(pendingReview)}><legend className="stack-sr-only">Review action</legend>
      {options.map((option) => <label key={option.event} className={`final-review-option ${option.event.toLowerCase()} ${draft.event === option.event ? "selected" : ""}`}>
        <input type="radio" name={`${formId}-action`} value={option.event} checked={draft.event === option.event} onChange={() => changeDraft({ ...draft, event: option.event })} />
        <span className="final-review-icon" aria-hidden="true">{option.icon}</span><span><strong>{option.label}</strong><small>{option.description}</small></span>
      </label>)}
    </fieldset>
    <label className="final-review-body">Review summary {draft.event === "APPROVE" && <span className="review-muted">(optional)</span>}
      <textarea aria-label="Review summary" disabled={Boolean(pendingReview)} placeholder={draft.event === "REQUEST_CHANGES" ? "What needs to change before this is ready?" : "Summarize your review… (Markdown supported)"} maxLength={10000} required={draft.event !== "APPROVE"} value={draft.body} onChange={(event) => changeDraft({ ...draft, body: event.target.value })} />
    </label>
    <div className="final-review-footer"><button className={`final-review-submit ${draft.event.toLowerCase()}`} type="submit" disabled={status !== "Saved" || Boolean(pendingReview) || (draft.event !== "APPROVE" && !draft.body.trim())}>{draft.event === "APPROVE" ? "Approve" : draft.event === "REQUEST_CHANGES" ? "Request changes" : "Submit comment"}</button></div>
    {pendingReview && <p role="status">{pendingReview.github.error || "Submitting your saved review to GitHub…"} <button type="button" disabled={status === "Saving…"} onClick={() => {
      setSubmittedId(pendingReview.id);
      if (status === "Not saved") {
        retry();
      } else {
        update({ type: "finalReview", review: pendingReview });
      }
    }}>Retry GitHub submission</button> <button type="button" disabled={status === "Saving…"} onClick={() => {
      setSubmittedId(null);
      update({ type: "cancelReview", id: pendingReview.id });
    }}>Return to draft</button></p>}
    {error ? <p role="alert">{error} {!pendingReview && <button type="button" onClick={retry}>Retry saving review</button>}</p> : <p className="final-review-status" role="status">{submittedReview?.github?.status === "submitted" ? <>Review saved locally and submitted to GitHub. <a href={submittedReview.github.url} target="_blank" rel="noreferrer">View on GitHub ↗</a></> : status === "Saving…" && submittedId ? "Saving and submitting review…" : status}</p>}
  </form>;
}
