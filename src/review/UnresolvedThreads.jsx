import GitHubMessage from "./GitHubMessage.jsx";
import GitHubThreadActions from "./GitHubThreadActions.jsx";
import { oldestFirst } from "./discussion-order.js";

export function unresolvedThreads(details) {
  return (details.github?.threads ?? []).filter((thread) => !thread.isResolved).map((thread) => {
    const ids = new Set(thread.comments?.nodes?.map((comment) => comment.databaseId) ?? []);
    const root = details.github?.inlineComments?.find((comment) => !comment.in_reply_to_id && ids.has(comment.id));
    return { thread, root, replies: root ? oldestFirst((details.github?.inlineComments ?? []).filter((comment) => comment.in_reply_to_id === root.id)) : [] };
  });
}

export default function UnresolvedThreads({ details, onUpdated }) {
  const threads = unresolvedThreads(details);
  return <div className="unresolved-threads">
    <p className="review-muted">Open discussions from the last Refresh, including your latest actions.</p>
    {!details.github?.threads ? <p>Refresh the PR to load threads.</p> : !threads.length ? <p className="empty-state">No unresolved threads.</p> : null}
    {threads.map(({ thread, root, replies }) => <article className="discussion-thread" key={thread.id}>
      {root ? <>
        <header className="discussion-thread-header"><a href={root.html_url} target="_blank" rel="noreferrer"><code>{root.path}{root.line ?? root.original_line ? `:${root.line ?? root.original_line}` : ""}</code> ↗</a>{thread.isOutdated && <span className="review-badge">Outdated</span>}</header>
        <div className="thread-messages">{[root, ...replies].map((message) => <GitHubMessage key={message.id} message={message} />)}</div>
        <GitHubThreadActions repository={details.repository} number={details.number} commentId={root.id} thread={thread} mode="reply" onUpdated={onUpdated} />
      </> : <p className="review-muted">Thread content unavailable. Refresh this PR.</p>}
    </article>)}
  </div>;
}
