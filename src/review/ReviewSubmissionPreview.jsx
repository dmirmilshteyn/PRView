import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import Markdown from "./Markdown.jsx";

export default function ReviewSubmissionPreview({ repository, number, review, onClose, onConfirm }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/review-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository, number, review }), signal: controller.signal });
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("Review preview is unavailable. Please try again.");
        }
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error);
        }
        if (!controller.signal.aborted) {
          setPreview(result);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure.message);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [repository, number, review]);
  return <Modal title="Preview GitHub review" onClose={onClose}>
    <p><strong>{({ APPROVE: "Approve", COMMENT: "Comment", REQUEST_CHANGES: "Request changes" })[review.event]}</strong> · {repository}#{number}</p>
    <h3>Summary</h3><Markdown>{review.body || "No summary."}</Markdown>
    {!preview && !error && <p role="status">Loading saved comments…</p>}
    {error && <p className="pr-refresh-error" role="alert">{error}</p>}
    {preview && <><h3>{preview.comments.length} file / line comments</h3>
      {preview.comments.map((comment) => <section className="review-preview-comment" key={comment.noteId}>
        <strong>{comment.path} · {comment.subjectType === "FILE" ? "File comment" : `${comment.side === "LEFT" ? "Old" : "New"} lines ${comment.startLine ?? comment.line}–${comment.line}`}</strong>
        <Markdown>{comment.body}</Markdown>
      </section>)}
      <p className="review-muted">This is the saved feedback that will be submitted. Unsent drafts, resolved notes, and previously submitted comments are excluded.</p></>}
    <div className="pr-confirm-actions"><button type="button" onClick={onClose}>Back to editing</button><button className="pr-confirm-primary" type="button" disabled={!preview} onClick={() => onConfirm(preview.token)}>Submit to GitHub</button></div>
  </Modal>;
}
