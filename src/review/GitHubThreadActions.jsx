import { useRef, useState } from "react";

export default function GitHubThreadActions({ repository, number, commentId, thread, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const inFlight = useRef(false);
  const request = useRef(null);

  async function submit(action) {
    if (inFlight.current || (action === "reply" && !body.trim())) {
      return;
    }
    if (action === "reply" && request.current?.body !== body) {
      request.current = { body, requestId: crypto.randomUUID() };
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/github-thread", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, number, commentId, action, ...(action === "reply" ? request.current : {}) }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The GitHub thread service is unavailable. Please try again.");
      }
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "GitHub could not update this thread");
      }
      onUpdated(result);
      if (action === "reply") {
        setBody("");
        setOpen(false);
        request.current = null;
      }
      setNotice(action === "reply" ? "Reply posted to GitHub" : action === "resolve" ? "Thread resolved on GitHub" : "Thread reopened on GitHub");
    } catch (failure) {
      setError(failure.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="github-thread-actions">
    <div className="github-thread-buttons">
      <button type="button" disabled={busy} onClick={() => setOpen(!open)}>{open ? "Hide reply" : "Reply"}</button>
      {thread && <button type="button" disabled={busy} onClick={() => submit(thread.isResolved ? "unresolve" : "resolve")}>{thread.isResolved ? "Unresolve" : "Resolve thread"}</button>}
      {busy && <span className="review-muted" role="status">Updating GitHub…</span>}
    </div>
    {open && <form onSubmit={(event) => { event.preventDefault(); submit("reply"); }}>
      <textarea autoFocus aria-label="Reply to GitHub thread" placeholder="Reply to this thread…" value={body} maxLength={60000} disabled={busy} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          submit("reply");
        }
      }} />
      <button type="submit" disabled={busy || !body.trim()}>Reply on GitHub</button>
    </form>}
    {error && <p className="pr-refresh-error" role="alert">{error}</p>}
    {notice && <p className="review-muted" role="status">{notice}</p>}
  </div>;
}
