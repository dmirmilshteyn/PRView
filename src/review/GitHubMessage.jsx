import Markdown from "./Markdown.jsx";
import CommentTime from "./CommentTime.jsx";
import GitHubLink from "./GitHubLink.jsx";

export default function GitHubMessage({ message, children }) {
  const author = message.user?.login || message.author?.login || "Reviewer";
  return <div className="thread-message">
    <span className="thread-avatar" aria-hidden="true">{author.slice(0, 1).toUpperCase()}</span>
    <div className="thread-message-content">
      <div className="thread-message-meta">
        <strong>{author}</strong>
        <CommentTime value={message.created_at ?? message.submitted_at ?? message.submittedAt} />
        {message.html_url && <GitHubLink href={message.html_url} label={`View ${author}'s comment on GitHub`} />}
      </div>
      {children}
      {message.body && <Markdown>{message.body}</Markdown>}
    </div>
  </div>;
}
