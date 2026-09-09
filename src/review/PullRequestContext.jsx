import Markdown from "./Markdown.jsx";
import GitHubMessage from "./GitHubMessage.jsx";
import GitHubLink from "./GitHubLink.jsx";
import LocalReviewComment from "./LocalReviewComment.jsx";
import { useLocalReview } from "./ReviewProvider.jsx";

export default function PullRequestContext({ details }) {
  const github = details.github;
  const { state, ready } = useLocalReview();
  return <section className="pr-context">
    <div className="context-heading"><h2>Description</h2><GitHubLink href={details.link} label="Open pull request in GitHub" /></div>
    <Markdown>{details.body ?? details.description}</Markdown>
    {details.body === undefined && <p className="review-muted">Sync this PR again to import its full description and GitHub discussions.</p>}
    <h2>Reviewers</h2>
    <p>{details.reviewers?.join(", ") || "No reviewers"}</p>
    <p>Requested: {details.reviewRequests?.map((actor) => actor.login || actor.name || actor.slug).join(", ") || "None recorded"}</p>
    <h2>Checks</h2>
    {details.checkRuns?.length ? <ul className="check-list">{details.checkRuns.map((check, index) => <li key={index}>
      <strong>{check.name || check.context || "Check"}</strong><span>{check.conclusion || check.state || check.status}</span>
      {(check.detailsUrl || check.targetUrl) && <a href={check.detailsUrl || check.targetUrl} target="_blank" rel="noreferrer">Details ↗</a>}
    </li>)}</ul> : <p>{details.checks}</p>}
    <details className="pr-discussion" open>
    <summary><h2>PR discussion <span className="review-badge">GitHub read-only</span></h2></summary>
    {!github && <p className="review-muted">Sync to import discussions.</p>}
    {github && !github.comments.length && !github.reviews.length && !github.inlineComments.length && <p>No GitHub discussion yet.</p>}
    <div className="discussion-threads">
    {github?.comments.map((comment) => <article className="discussion-thread" aria-label={`Comment by ${comment.user?.login || "Reviewer"}`} key={`comment-${comment.id}`}>
      <div className="thread-messages"><GitHubMessage message={comment} /></div>
    </article>)}
    {(github?.reviews ?? details.reviewHistory ?? []).map((review, index) => <article className="discussion-thread" aria-label={`Review by ${review.user?.login || review.author?.login || "Reviewer"}`} key={`review-${review.id ?? index}`}>
      <div className="thread-messages"><GitHubMessage message={review}>
        <span className={`review-state ${review.state?.toLowerCase()}`}>{({ APPROVED: "Approved", CHANGES_REQUESTED: "Changes requested", COMMENTED: "Reviewed", DISMISSED: "Review dismissed", PENDING: "Pending review" })[review.state] || review.state}</span>
      </GitHubMessage></div>
    </article>)}
    {github?.inlineComments.filter((comment) => !comment.in_reply_to_id).map((comment) => {
      const thread = github.threads?.find((thread) => thread.comments.nodes.some((node) => node.databaseId === comment.id));
      const replies = github.inlineComments.filter((reply) => reply.in_reply_to_id === comment.id);
      const line = comment.line ?? comment.original_line;
      return <article className={`discussion-thread ${thread?.isResolved ? "resolved" : ""}`} aria-label={`Discussion on ${comment.path}`} key={`inline-${comment.id}`}>
        <header className="discussion-thread-header">
          <a className="discussion-file" href={comment.html_url} target="_blank" rel="noreferrer"><code>{comment.path}{line != null ? `:${line}` : ""}</code> ↗</a>
          {replies.length > 0 && <span className="discussion-reply-count">{replies.length} {replies.length === 1 ? "reply" : "replies"}</span>}
          {thread?.isOutdated && <span className="review-badge">Outdated</span>}
          <span className={`thread-state ${thread?.isResolved ? "is-resolved" : ""}`}>{thread?.isResolved ? "✓ Resolved" : "Open thread"}</span>
        </header>
        <div className="thread-messages">{[comment, ...replies].map((item) => <GitHubMessage message={item} key={item.id} />)}</div>
      </article>;
    })}
    {ready && (state.reviews ?? []).map((review) => <LocalReviewComment key={review.id} review={review} />)}
    </div>
    </details>
  </section>;
}
