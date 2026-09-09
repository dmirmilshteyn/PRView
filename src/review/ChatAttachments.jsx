export default function ChatAttachments({ attachments, onRemove }) {
  if (!attachments?.length) {
    return null;
  }
  return <section className="chat-attachments" aria-label="Attached comments">
    {attachments.map((item) => <div className="chat-attachment" key={item.id}>
      <details><summary>{item.filePath} · {item.anchor.side === "LEFT" ? "Old" : "New"} L{item.anchor.start}–{item.anchor.end}</summary>
        <small>Revision {item.anchor.revision.slice(0, 8)}</small>
        <pre>{item.anchor.excerpt}</pre><p>{item.body}</p>
      </details>
      {onRemove && <button type="button" aria-label={`Remove attachment ${item.filePath} lines ${item.anchor.start}–${item.anchor.end}`} onClick={() => onRemove(item.id)}>×</button>}
    </div>)}
  </section>;
}
