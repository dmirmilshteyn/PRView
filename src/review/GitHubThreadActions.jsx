import { useRef, useState } from "react";

export default function GitHubThreadActions({ repository, number, commentId, thread, onUpdated, mode }) {
  const discussion = mode === "discussion";
  const postAction = discussion ? "comment" : "reply";
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const inFlight = useRef(false);
  const request = useRef(null);

  async function submit(action) {
    if (inFlight.current || (action === postAction && !body.trim())) {
      return;
    }
    if (action === postAction && request.current?.body !== body) {
      request.current = { body, requestId: crypto.randomUUID() };
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/github-thread", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, number, commentId, action, ...(action === postAction ? request.current : {}) }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The GitHub thread service is unavailable. Please try again.");
      }
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "GitHub could not update this thread");
      }
      onUpdated(result);
      if (action === postAction) {
        setBody("");
        setOpen(false);
        request.current = null;
      }
      setNotice(action === "comment" ? "Comment posted to GitHub" : action === "reply" ? "Reply posted to GitHub" : action === "resolve" ? "Thread resolved on GitHub" : "Thread reopened on GitHub");
    } catch (failure) {
      setError(failure.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="github-thread-actions">
    <div className="github-thread-buttons">
      <button className={discussion && !open ? "discussion-comment-button" : undefined} type="button" disabled={busy} aria-expanded={open} onClick={() => setOpen(!open)}>
        {discussion && !open && <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 2.5h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7l-4 3v-3H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" /><path d="M5 6h6M5 8.5h4" /></svg>}
        {open ? "Hide composer" : discussion ? "Add comment" : "Reply"}
      </button>
      {thread && <button type="button" disabled={busy} onClick={() => submit(thread.isResolved ? "unresolve" : "resolve")}>{thread.isResolved ? "Unresolve" : "Resolve thread"}</button>}
      {busy && <span className="review-muted" role="status">Updating GitHub…</span>}
    </div>
    {open && <form onSubmit={(event) => { event.preventDefault(); submit(postAction); }}>
      <textarea autoFocus aria-label={discussion ? "Comment on PR discussion" : "Reply to GitHub thread"} placeholder={discussion ? "Add to the discussion…" : "Reply to this thread…"} value={body} maxLength={60000} disabled={busy} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          submit(postAction);
        }
      }} />
      <button className={discussion ? "discussion-comment-button" : undefined} type="submit" disabled={busy || !body.trim()}>{discussion ? "Post comment" : "Reply on GitHub"}</button>
    </form>}
    {error && <p className="pr-refresh-error" role="alert">{error}</p>}
    {notice && <p className="review-muted" role="status">{notice}</p>}
  </div>;
}
