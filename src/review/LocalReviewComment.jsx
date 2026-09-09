import CommentTime from "./CommentTime.jsx";
import Markdown from "./Markdown.jsx";

export default function LocalReviewComment({ review }) {
  const label = { COMMENT: "Commented", REQUEST_CHANGES: "Changes requested", APPROVE: "Approved" }[review.event];
  return <article className="discussion-thread local-review-comment" id={`local-review-${review.id}`} aria-label={`Review: ${label}`}>
    <div className="thread-messages"><div className="thread-message">
      <span className="thread-avatar" aria-hidden="true">Y</span>
      <div className="thread-message-content">
        <div className="thread-message-meta"><strong>You</strong><CommentTime value={review.createdAt} /><span className="review-badge" title={review.revision}>Snapshot {review.revision.slice(0, 8)}</span></div>
        <span className={`review-state ${review.event === "APPROVE" ? "approved" : review.event === "REQUEST_CHANGES" ? "changes_requested" : "commented"}`}>{label}</span>
        {review.body && <Markdown>{review.body}</Markdown>}
      </div>
    </div></div>
  </article>;
}
