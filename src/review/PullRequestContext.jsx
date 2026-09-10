import Markdown from "./Markdown.jsx";
import AutoMergeToggle from "./AutoMergeToggle.jsx";
import GitHubMessage from "./GitHubMessage.jsx";
import GitHubLink from "./GitHubLink.jsx";
import LocalReviewComment from "./LocalReviewComment.jsx";
import GitHubThreadActions from "./GitHubThreadActions.jsx";
import { useLocalReview } from "./ReviewProvider.jsx";
import { discussionEntries, oldestFirst } from "./discussion-order.js";

export default function PullRequestContext({ details, onThreadUpdated, children }) {
  const github = details.github;
  const { state, ready } = useLocalReview();
  const entries = discussionEntries(details, ready ? state.reviews ?? [] : []);
  return <section className="pr-context">
    <div className="pr-info-overview">
    <div className="pr-info-description">
    <div className="context-heading"><h2>Description</h2><GitHubLink href={details.link} label="Open pull request in GitHub" /></div>
    <Markdown>{details.body ?? details.description}</Markdown>
    {details.body === undefined && <p className="review-muted">Sync this PR again to import its full description and GitHub discussions.</p>}
    </div>
    {children}
    </div>
    <div className="pr-info-controls">
    <AutoMergeToggle key={`${details.repository}:${details.number}`} repository={details.repository} number={details.number} syncedAt={details.syncedAt} />
    <div>
    <h2>Reviewers</h2>
    <p>{details.reviewers?.join(", ") || "No reviewers"}</p>
    <p>Requested: {details.reviewRequests?.map((actor) => actor.login || actor.name || actor.slug).join(", ") || "None recorded"}</p>
    </div>
    <div>
    <h2>Checks</h2>
    {details.checkRuns?.length ? <ul className="check-list">{details.checkRuns.map((check, index) => <li key={index}>
      <strong>{check.name || check.context || "Check"}</strong><span>{check.conclusion || check.state || check.status}</span>
      {(check.detailsUrl || check.targetUrl) && <a href={check.detailsUrl || check.targetUrl} target="_blank" rel="noreferrer">Details ↗</a>}
    </li>)}</ul> : <p>{details.checks}</p>}
    </div>
    </div>
    <details className="pr-discussion" open>
    <summary><h2>PR discussion</h2><span className="discussion-count">{entries.length}</span></summary>
    {!github && <p className="review-muted">Sync to import discussions.</p>}
    {github && !entries.length && <div className="discussion-empty">
      <span className="discussion-empty-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M7 9h10M7 13h6" /></svg></span>
      <div><strong>Start the discussion</strong><p>Share a question, feedback, or an update on this PR.</p></div>
    </div>}
    <ol className="discussion-threads discussion-numbered" aria-label="PR discussion, oldest first">
    {entries.map((entry, index) => {
      const comment = entry.message;
      const review = entry.message;
      let content;
      if (entry.kind === "comment") {
        content = <article className="discussion-thread" aria-label={`Comment by ${comment.user?.login || "Reviewer"}`}>
      <div className="thread-messages"><GitHubMessage message={comment} /></div>
    </article>;
      } else if (entry.kind === "review") {
        content = <article className="discussion-thread" aria-label={`Review by ${review.user?.login || review.author?.login || "Reviewer"}`}>
      <div className="thread-messages"><GitHubMessage message={review}>
        <span className={`review-state ${review.state?.toLowerCase()}`}>{({ APPROVED: "Approved", CHANGES_REQUESTED: "Changes requested", COMMENTED: "Reviewed", DISMISSED: "Review dismissed", PENDING: "Pending review" })[review.state] || review.state}</span>
      </GitHubMessage></div>
    </article>;
      } else if (entry.kind === "local") {
        content = <LocalReviewComment review={review} />;
      } else {
      const thread = github.threads?.find((thread) => thread.comments.nodes.some((node) => node.databaseId === comment.id));
      const replies = oldestFirst(github.inlineComments.filter((reply) => reply.in_reply_to_id === comment.id));
      const line = comment.line ?? comment.original_line;
      content = <article className={`discussion-thread ${thread?.isResolved ? "resolved" : ""}`} aria-label={`Discussion on ${comment.path}`}>
        <header className="discussion-thread-header">
          <a className="discussion-file" href={comment.html_url} target="_blank" rel="noreferrer"><code>{comment.path}{line != null ? `:${line}` : ""}</code> ↗</a>
          {replies.length > 0 && <span className="discussion-reply-count">{replies.length} {replies.length === 1 ? "reply" : "replies"}</span>}
          {thread?.isOutdated && <span className="review-badge">Outdated</span>}
          <span className={`thread-state ${thread?.isResolved ? "is-resolved" : ""}`}>{thread?.isResolved ? "✓ Resolved" : "Open thread"}</span>
        </header>
        <div className="thread-messages">{[comment, ...replies].map((item) => <GitHubMessage message={item} key={item.id} />)}</div>
        <GitHubThreadActions key={`${details.repository}:${details.number}:${comment.id}`} repository={details.repository} number={details.number} commentId={comment.id} thread={thread} mode="reply" onUpdated={onThreadUpdated} />
      </article>;
      }
      return <li key={entry.key}><span className="discussion-number" aria-hidden="true">#{index + 1}</span>{content}</li>;
    })}
    </ol>
    <GitHubThreadActions key={`${details.repository}:${details.number}:discussion`} repository={details.repository} number={details.number} commentId={null} thread={null} mode="discussion" onUpdated={onThreadUpdated} />
    </details>
  </section>;
}
