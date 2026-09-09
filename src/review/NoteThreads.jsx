import Markdown from "./Markdown.jsx";
import CommentTime from "./CommentTime.jsx";
import { useEffect, useRef } from "react";

export function newDraft() {
  return { body: "", severity: "info", anchor: null, replyDrafts: {} };
}

export default function NoteThreads({ filePath, revision, notes, draft, onDraft, onUpdate, onCancel, onJump, showComposer, inline }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (showComposer && draft.open) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [showComposer, draft.open, draft.anchor?.start, draft.anchor?.end]);

  function saveNote() {
    onUpdate({ type: "note", note: {
      id: crypto.randomUUID(), filePath, revision, body: draft.body.trim(), severity: draft.severity,
      anchor: draft.anchor, resolved: false, createdAt: new Date().toISOString(), replies: [],
    } });
  }

  return <div className="local-notes">
    {notes.map((note) => <details className={`local-note ${note.resolved ? "resolved" : ""}`} key={note.id} open={!note.resolved}>
      <summary><span className="thread-summary"><span className="thread-location">{note.anchor ? `${inline ? "Lines" : note.anchor.side === "LEFT" ? "Old lines" : "New lines"} ${note.anchor.start}–${note.anchor.end}` : "File comment"}</span><span className={`severity ${note.severity}`}>{note.severity}</span>
        {(note.anchor?.revision ?? note.revision) !== revision && <span className="review-badge">Earlier revision {(note.anchor?.revision ?? note.revision).slice(0, 8)}</span>}
        <span className={`thread-state ${note.resolved ? "is-resolved" : ""}`}>{note.resolved ? "✓ Resolved" : "Open thread"}</span></span>
      </summary>
      <div className="thread-messages">
      {[note, ...(note.replies ?? [])].map((message, index) => <div className="thread-message" key={message.id}>
        <span className="thread-avatar" aria-hidden="true">Y</span>
        <div className="thread-message-content"><div className="thread-message-meta"><strong>You</strong><CommentTime value={message.createdAt} /></div>
          {index === 0 && note.anchor && !inline && <><button type="button" onClick={() => onJump(note)}>View anchored code</button><pre className="note-excerpt">{note.anchor.excerpt}</pre></>}
          <Markdown>{message.body}</Markdown>
        </div>
      </div>)}
      </div>
      <div className="thread-footer">
      <label className="reply-label"><span className="stack-sr-only">Reply</span><textarea rows={2} placeholder="Reply to this thread…" aria-label={`Reply to ${note.body}`} value={draft.replyDrafts[note.id] ?? ""} onChange={(event) => onDraft({ ...draft, replyDrafts: { ...draft.replyDrafts, [note.id]: event.target.value } })} /></label>
      <div className="thread-actions"><button type="button" onClick={() => onUpdate({ type: "resolve", id: note.id, resolved: !note.resolved })}>{note.resolved ? "Reopen thread" : "Resolve thread"}</button>
      <button className="thread-reply-submit" type="button" disabled={!draft.replyDrafts[note.id]?.trim()} onClick={() => {
        onUpdate({ type: "reply", id: note.id, reply: { id: crypto.randomUUID(), body: draft.replyDrafts[note.id].trim(), createdAt: new Date().toISOString() } });
        onDraft({ ...draft, replyDrafts: { ...draft.replyDrafts, [note.id]: "" } });
      }}>Save reply</button></div>
      </div>
    </details>)}
    {showComposer && draft.open && <section className="local-composer" aria-label={`Comment on ${filePath}`}>
      <div className="context-heading"><strong>{draft.anchor ? `Comment · lines ${draft.anchor.start}–${draft.anchor.end}` : "File comment"}</strong><button type="button" onClick={onCancel}>Discard draft</button></div>
      {draft.anchor && !inline && <pre className="note-excerpt">{draft.anchor.excerpt}</pre>}
      <label>Severity <select aria-label={`Comment severity for ${filePath}`} value={draft.severity} onChange={(event) => onDraft({ ...draft, severity: event.target.value })}>
        <option value="info">Info</option><option value="question">Question</option><option value="warning">Warning</option><option value="blocking">Blocking</option>
      </select></label>
      <textarea ref={inputRef} aria-label={`Comment on ${filePath}`} placeholder="Write a comment (Markdown supported)…" value={draft.body} onChange={(event) => onDraft({ ...draft, body: event.target.value })} />
      <div className="comment-submit-row"><button type="button" disabled={!draft.body.trim()} onClick={saveNote}>Save comment</button></div>
    </section>}
  </div>;
}
