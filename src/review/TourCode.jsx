import { Fragment, useEffect, useRef, useState } from "react";
import { highlightCode } from "./syntax.js";
import { useLocalReview } from "./ReviewProvider.jsx";
import { draftKey } from "./state.js";
import NoteThreads, { newDraft } from "./NoteThreads.jsx";
import { tourCommentLine } from "./tour-comments.js";

export default function TourCode({ reference, revision }) {
  const { state, ready, status, error, update, retry } = useLocalReview();
  const [highlighted, setHighlighted] = useState(null);
  const origin = useRef(null);
  const root = useRef(null);
  const drag = useRef(null);
  const skipClick = useRef(false);
  const [dragRange, setDragRange] = useState(null);
  const draft = state.drafts[draftKey(revision, reference.path)] ?? newDraft();
  const lines = reference.excerpt.split("\n");
  const notes = state.notes.filter((note) => note.filePath === reference.path);
  const draftLine = draft.open ? tourCommentLine(draft.anchor, reference, revision) : null;
  const selected = dragRange ?? (draftLine !== null ? draft.anchor : null);
  const onDraft = (value) => update({ type: "draft", filePath: reference.path, revision, draft: value });

  useEffect(() => {
    let cancelled = false;
    highlightCode(reference.path, reference.excerpt).then((tokens) => {
      if (!cancelled) {
        setHighlighted({ path: reference.path, excerpt: reference.excerpt, tokens });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [reference.path, reference.excerpt]);
  const tokens = highlighted?.path === reference.path && highlighted.excerpt === reference.excerpt ? highlighted.tokens : null;

  function select(first, last) {
    const start = Math.min(first, last);
    const end = Math.max(first, last);
    onDraft({ ...draft, open: true, anchor: { side: reference.side, sourceSide: reference.side, revision, start, end, excerpt: lines.slice(start - reference.start, end - reference.start + 1).join("\n") } });
  }

  return <div className="tour-code-body" ref={root}>
    {lines.map((line, offset) => {
      const number = reference.start + offset;
      const group = notes.filter((note) => tourCommentLine(note.anchor ? { ...note.anchor, revision: note.anchor.revision ?? note.revision } : null, reference, revision) === number);
      const showComposer = draftLine === number;
      return <Fragment key={number}>
        <div className="tour-code-line"><button type="button" className={`tour-line-number ${selected && number >= selected.start && number <= selected.end ? "selected-line" : ""}`} disabled={!ready} aria-label={`${reference.side === "LEFT" ? "Old" : "New"} line ${number} in ${reference.path}`} title="Comment on this line; drag or Shift-click for a range" data-tour-line={number}
          onPointerDown={(event) => {
            skipClick.current = false;
            if (event.button === 0 && event.pointerType === "mouse") {
              drag.current = { start: number, end: number };
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerMove={(event) => {
            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("button[data-tour-line]");
            if (drag.current && target && root.current.contains(target)) {
              drag.current.end = Number(target.dataset.tourLine);
              setDragRange({ start: Math.min(drag.current.start, drag.current.end), end: Math.max(drag.current.start, drag.current.end) });
            }
          }}
          onPointerUp={() => {
            if (drag.current && drag.current.start !== drag.current.end) {
              skipClick.current = true;
              origin.current = drag.current.start;
              select(drag.current.start, drag.current.end);
            }
            drag.current = null;
            setDragRange(null);
          }}
          onPointerCancel={() => { drag.current = null; setDragRange(null); }}
          onClick={(event) => {
            if (skipClick.current) {
              skipClick.current = false;
              return;
            }
            origin.current = event.shiftKey ? origin.current ?? number : number;
            select(origin.current, number);
          }}>{number}</button><code>{tokens?.[offset] ? tokens[offset].map((token, index) => <span key={index} style={{ color: token.color }}>{token.content}</span>) : line}{"\n"}</code></div>
        {(group.length > 0 || showComposer) && <div className="tour-inline-comments">
          <NoteThreads filePath={reference.path} revision={revision} notes={group} draft={draft} onDraft={onDraft} onUpdate={update} onCancel={() => onDraft(newDraft())} onJump={() => {}} showComposer={showComposer} inline={true} />
          <p className="review-muted" role="status">{status}</p>
          {error && <p role="alert">{error} <button type="button" onClick={retry}>Retry saving</button></p>}
        </div>}
      </Fragment>;
    })}
  </div>;
}
