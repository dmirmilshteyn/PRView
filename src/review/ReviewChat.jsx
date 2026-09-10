import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown.jsx";
import CommentTime from "./CommentTime.jsx";
import { ChatAttachmentsContext } from "./ChatAttachmentsContext.jsx";
import ChatAttachments from "./ChatAttachments.jsx";
import { validateChatAttachments } from "../../lib/chat-attachments.js";
import { chatDraftKey, readChatDraft, writeChatDraft, clearSentChatDraft } from "./chat-draft.js";
import UnresolvedThreads, { unresolvedThreads } from "./UnresolvedThreads.jsx";

export default function ReviewChat({ repository, number, children, details, onThreadUpdated }) {
  const [panel, setPanel] = useState("chat");
  const [open, setOpen] = useState(true);
  const [chat, setChat] = useState(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const attachmentsRef = useRef([]);
  const [sending, setSending] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const restartRequest = useRef(null);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState(null);
  const draftRef = useRef("");
  const messagesRef = useRef(null);
  const composerRef = useRef(null);
  const follow = useRef(true);
  const pendingRequest = useRef(null);
  const sendingRef = useRef(false);
  const generation = useRef(0);
  const active = useRef(true);
  const url = `/api/chat?repository=${encodeURIComponent(repository)}&pr=${number}`;
  const storageKey = chatDraftKey(repository, number);

  useEffect(() => {
    try {
      const saved = readChatDraft(window.localStorage, storageKey);
      draftRef.current = saved.message;
      attachmentsRef.current = saved.attachments;
      pendingRequest.current = saved.pendingRequest;
      setDraft(saved.message);
      setAttachments(saved.attachments);
    } catch {
      setDraftError("Could not restore the saved chat draft. New edits will replace it.");
    }
    setDraftReady(true);
  }, [storageKey]);

  function persistDraft() {
    try {
      writeChatDraft(window.localStorage, storageKey, { message: draftRef.current, attachments: attachmentsRef.current, pendingRequest: pendingRequest.current });
      setDraftError(null);
    } catch {
      setDraftError("Could not save your chat draft in this browser. Keep this PR open until you send it.");
    }
  }

  function changeDraft(value) {
    draftRef.current = value;
    setDraft(value);
    persistDraft();
  }

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if ((!open || panel !== "chat") && chat?.status !== "running") {
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
          const pending = pendingRequest.current;
          if (pending && value.messages.some((message) => message.id === pending.requestId && message.role === "user")) {
            try {
              const remaining = clearSentChatDraft(window.localStorage, storageKey, pending);
              draftRef.current = remaining.message;
              attachmentsRef.current = remaining.attachments;
              pendingRequest.current = remaining.pendingRequest;
              setDraft(remaining.message);
              setAttachments(remaining.attachments);
            } catch {
              setDraftError("Your message was sent, but the saved draft could not be cleared.");
            }
          }
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
  }, [open, panel, url, chat?.status, retry]);

  useEffect(() => {
    if (open && follow.current && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [open, chat?.messages, chat?.activity]);

  function updateAttachments(value) {
    attachmentsRef.current = value;
    setAttachments(value);
    persistDraft();
  }

  useEffect(() => {
    if (open && attachments.length > 0) {
      composerRef.current?.focus({ preventScroll: true });
    }
  }, [open, attachments]);

  function attach(note) {
    if (!draftReady) {
      return false;
    }
    setOpen(true);
    setPanel("chat");
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

  async function restart() {
    if (!draftReady || !chat || sendingRef.current || chat.status === "running") {
      return;
    }
    restartRequest.current ??= crypto.randomUUID();
    sendingRef.current = true;
    generation.current += 1;
    setRestarting(true);
    setError(null);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository, number, action: "restart", requestId: restartRequest.current }) });
      const value = await response.json();
      if (!response.ok) {
        throw new Error(value.error || "Could not restart this chat");
      }
      if (active.current) {
        generation.current += 1;
        setChat(value);
        pendingRequest.current = null;
        restartRequest.current = null;
        persistDraft();
        follow.current = true;
        composerRef.current?.focus();
      }
    } catch (failure) {
      if (active.current) {
        setError(failure.message);
      }
    } finally {
      sendingRef.current = false;
      if (active.current) {
        setRestarting(false);
      }
    }
  }

  async function send(event) {
    event.preventDefault();
    if (!draftReady || !draft.trim() || sendingRef.current || chat?.status === "running") {
      return;
    }
    const message = draft.trim();
    const batch = attachmentsRef.current;
    if (pendingRequest.current?.message !== message || JSON.stringify(pendingRequest.current?.attachments) !== JSON.stringify(batch)) {
      pendingRequest.current = { message, attachments: batch, requestId: crypto.randomUUID() };
    }
    const request = pendingRequest.current;
    persistDraft();
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
      let remaining;
      try {
        remaining = clearSentChatDraft(window.localStorage, storageKey, request);
      } catch {
        remaining = { message: "", attachments: attachmentsRef.current.filter((item) => !batch.some((sent) => JSON.stringify(sent) === JSON.stringify(item))), pendingRequest: null };
      }
      if (active.current) {
        setChat(value);
        draftRef.current = remaining.message;
        attachmentsRef.current = remaining.attachments;
        pendingRequest.current = remaining.pendingRequest;
        setDraft(remaining.message);
        setAttachments(remaining.attachments);
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
    <aside className="review-chat" id="review-chat" aria-label="PR chat and threads" hidden={!open}>
      <header className="review-chat-header">
        <div><strong>{panel === "chat" ? "Review chat" : "Unresolved threads"}</strong><span>PR #{number}{panel === "chat" ? " · Luna" : ""}</span></div>
        <div className="chat-header-actions">
          {panel === "chat" && <button className="chat-header-icon" type="button" onClick={restart} disabled={!draftReady || !chat || sending || restarting || chat.status === "running"} aria-label={restarting ? "Restarting chat" : "Restart chat session"} aria-busy={restarting} title="Restart chat · keeps your draft and archives this conversation">
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7" /></svg>
          </button>}
          <button className="chat-header-icon" type="button" aria-label="Collapse PR sidebar" title="Collapse sidebar" aria-expanded={open} aria-controls="review-chat" onClick={() => setOpen(false)}>
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16m-7-11 3 3-3 3" /></svg>
          </button>
        </div>
      </header>
      <div className="pr-sidebar-tabs" aria-label="PR sidebar panels">
        <button type="button" title="Chat" aria-label="Chat" aria-pressed={panel === "chat"} onClick={() => setPanel("chat")}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M7 9h10M7 13h6" /></svg>
        </button>
        <button type="button" title="Unresolved threads" aria-label={`Unresolved threads (${unresolvedThreads(details).length})`} aria-pressed={panel === "threads"} onClick={() => setPanel("threads")}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="18" cy="12" r="2" /><path d="M5 7v10M5 9a3 3 0 0 0 3 3h8" /></svg>
          <span aria-hidden="true">{unresolvedThreads(details).length}</span>
        </button>
      </div>
      {panel === "threads" && <UnresolvedThreads details={details} onUpdated={onThreadUpdated} />}
      <div className="pr-sidebar-chat" hidden={panel !== "chat"}>
      <div className="chat-messages" ref={messagesRef} onScroll={(event) => { const element = event.currentTarget; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 70; }}>
        {!chat && !error && <p className="review-muted">Loading conversation…</p>}
        {chat?.messages.length === 0 && <div className="chat-empty"><p>Ask about bugs, tradeoffs, missing tests, or anything in the diff.</p></div>}
        {chat?.messages.map((message) => <div className={`chat-message ${message.role}`} key={message.id}><div className="thread-message-meta"><strong>{message.role === "user" ? "You" : "Luna"}</strong><CommentTime value={message.createdAt} /></div><ChatAttachments attachments={message.attachments} onRemove={null} /><Markdown>{message.text}</Markdown></div>)}
        {chat?.status === "running" && <p className="chat-activity" role="status">{chat.activity || "Luna is responding…"}</p>}
        {chat?.error && <p className="chat-error" role="alert">{chat.error}</p>}
      </div>
      {error && <p className="chat-error" role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry connection</button></p>}
      <form className="chat-compose" onSubmit={send}>
        {draftError && <p className="chat-error" role="alert">{draftError}</p>}
        {attachments.length > 0 && <p className="review-muted" role="status">Pending context · included when you send your message</p>}
        <ChatAttachments attachments={attachments} onRemove={sending ? null : (id) => updateAttachments(attachmentsRef.current.filter((item) => item.id !== id))} /><label className="stack-sr-only" htmlFor="review-chat-message">Message Luna</label><textarea ref={composerRef} id="review-chat-message" placeholder="Ask Luna about this PR…" value={draft} maxLength={10000} disabled={sending || !draftReady} onChange={(event) => changeDraft(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.form.requestSubmit();
        }
      }} /><div><span title={chat?.sessionId || "A session starts with your first message"}>{chat?.sessionId ? `Session ${chat.sessionId.slice(0, 8)}` : "Luna · PR context included"}</span><button type="submit" disabled={!draftReady || !chat || sending || restarting || chat.status === "running" || !draft.trim()}>{sending ? "Sending…" : "Send"}</button></div></form>
      </div>
    </aside>
  </div></ChatAttachmentsContext.Provider>;
}
