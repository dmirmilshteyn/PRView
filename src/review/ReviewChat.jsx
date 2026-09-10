import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown.jsx";
import CommentTime from "./CommentTime.jsx";
import { ChatAttachmentsContext } from "./ChatAttachmentsContext.jsx";
import ChatAttachments from "./ChatAttachments.jsx";
import { validateChatAttachments } from "../../lib/chat-attachments.js";

export default function ReviewChat({ repository, number, children }) {
  const [open, setOpen] = useState(true);
  const [chat, setChat] = useState(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const attachmentsRef = useRef([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const messagesRef = useRef(null);
  const composerRef = useRef(null);
  const follow = useRef(true);
  const pendingRequest = useRef(null);
  const sendingRef = useRef(false);
  const generation = useRef(0);
  const active = useRef(true);
  const url = `/api/chat?repository=${encodeURIComponent(repository)}&pr=${number}`;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (!open && chat?.status !== "running") {
      return;
    }
    let cancelled = false;
    let timer;
    const controller = new AbortController();
    async function poll() {
      const startedAt = generation.current;
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const value = await response.json();
        if (!response.ok) {
          throw new Error(value.error);
        }
        if (!cancelled && !sendingRef.current && startedAt === generation.current) {
          setChat(value);
          setError(null);
        }
        if (!cancelled) {
          timer = setTimeout(poll, value.status === "running" ? 1000 : 5000);
        }
      } catch (failure) {
        if (!cancelled) {
          setError(failure.message);
        }
      }
    }
    poll();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [open, url, chat?.status, retry]);

  useEffect(() => {
    if (open && follow.current && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [open, chat?.messages, chat?.activity]);

  function updateAttachments(value) {
    attachmentsRef.current = value;
    setAttachments(value);
  }

  useEffect(() => {
    if (open && attachments.length > 0) {
      composerRef.current?.focus({ preventScroll: true });
    }
  }, [open, attachments]);

  function attach(note) {
    setOpen(true);
    try {
      const attachment = { id: note.id, filePath: note.filePath, revision: note.revision, body: [note.body, ...(note.replies ?? []).map((reply) => `Reply: ${reply.body}`)].join("\n\n"), anchor: { ...note.anchor, revision: note.anchor?.revision ?? note.revision } };
      updateAttachments(validateChatAttachments([...attachmentsRef.current.filter((item) => item.id !== note.id), attachment]));
      setError(null);
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    }
  }

  async function send(event) {
    event.preventDefault();
    if (!draft.trim() || sendingRef.current || chat?.status === "running") {
      return;
    }
    const message = draft.trim();
    const batch = attachmentsRef.current;
    if (pendingRequest.current?.message !== message || JSON.stringify(pendingRequest.current?.attachments) !== JSON.stringify(batch)) {
      pendingRequest.current = { message, attachments: batch, requestId: crypto.randomUUID() };
    }
    sendingRef.current = true;
    generation.current += 1;
    setSending(true);
    setError(null);
    follow.current = true;
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository, number, ...pendingRequest.current }) });
      const value = await response.json();
      if (!response.ok) {
        throw new Error(value.error);
      }
      if (active.current) {
        setChat(value);
        setDraft("");
        updateAttachments(attachmentsRef.current.filter((item) => !batch.some((sent) => JSON.stringify(sent) === JSON.stringify(item))));
        pendingRequest.current = null;
      }
    } catch (failure) {
      if (active.current) {
        setError(failure.message);
      }
    } finally {
      sendingRef.current = false;
      if (active.current) {
        setSending(false);
      }
    }
  }

  return <ChatAttachmentsContext.Provider value={{ attach, attachments }}><div className={`pr-chat-layout ${open ? "chat-open" : ""}`}>
    <div className="pr-chat-main">{children}</div>
    <button className="scroll-to-top" type="button" title="Scroll to top" aria-label="Scroll to top" onClick={() => window.scrollTo({ top: 0, left: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14M12 20V8m-6 6 6-6 6 6" /></svg>
    </button>
    {!open && <div className="chat-rail"><button className="chat-launcher" type="button" title="Open review chat" aria-label="Open review chat" onClick={() => setOpen(true)} aria-expanded={false} aria-controls="review-chat">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9Z" /><path d="M8 8h8M8 12h5" /></svg>
      {chat?.status === "running" && <span className="chat-running-dot" aria-label="Agent responding">●</span>}
    </button></div>}
    <aside className="review-chat" id="review-chat" aria-label="Review chat" hidden={!open}>
      <header className="review-chat-header"><div><strong>Review chat</strong><span>Luna · PR #{number}</span></div><button type="button" aria-label="Collapse review chat" aria-expanded={open} aria-controls="review-chat" onClick={() => setOpen(false)}>→</button></header>
      <div className="chat-messages" ref={messagesRef} onScroll={(event) => { const element = event.currentTarget; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 70; }}>
        {!chat && !error && <p className="review-muted">Loading conversation…</p>}
        {chat?.messages.length === 0 && <div className="chat-empty"><strong>A second look at this PR</strong><p>Ask about bugs, tradeoffs, missing tests, or anything in the diff.</p></div>}
        {chat?.messages.map((message) => <div className={`chat-message ${message.role}`} key={message.id}><div className="thread-message-meta"><strong>{message.role === "user" ? "You" : "Luna"}</strong><CommentTime value={message.createdAt} /></div><ChatAttachments attachments={message.attachments} onRemove={null} /><Markdown>{message.text}</Markdown></div>)}
        {chat?.status === "running" && <p className="chat-activity" role="status">{chat.activity || "Luna is responding…"}</p>}
        {chat?.error && <p className="chat-error" role="alert">{chat.error}</p>}
      </div>
      {error && <p className="chat-error" role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry connection</button></p>}
      <form className="chat-compose" onSubmit={send}>
        {attachments.length > 0 && <p className="review-muted" role="status">Pending context · included when you send your message</p>}
        <ChatAttachments attachments={attachments} onRemove={sending ? null : (id) => updateAttachments(attachmentsRef.current.filter((item) => item.id !== id))} /><label className="stack-sr-only" htmlFor="review-chat-message">Message Luna</label><textarea ref={composerRef} id="review-chat-message" placeholder="Ask Luna about this PR…" value={draft} maxLength={10000} disabled={sending} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.form.requestSubmit();
        }
      }} /><div><span title={chat?.sessionId || "A session starts with your first message"}>{chat?.sessionId ? `Session ${chat.sessionId.slice(0, 8)}` : "Luna · PR context included"}</span><button type="submit" disabled={!chat || sending || chat.status === "running" || !draft.trim()}>{sending ? "Sending…" : "Send"}</button></div></form>
    </aside>
  </div></ChatAttachmentsContext.Provider>;
}
