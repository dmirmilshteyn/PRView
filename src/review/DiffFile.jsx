import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createHighlighter } from "shiki";
import { makeHunks, numberedLines, splitRows } from "./diff.js";
import NoteThreads from "./NoteThreads.jsx";
import { placeComments } from "./comment-placement.js";

let highlighterPromise;

function language(filePath) {
  return { js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", css: "css", json: "json", md: "markdown", py: "python", cs: "csharp", sh: "bash", yml: "yaml", yaml: "yaml" }[filePath.split(".").pop()] ?? "text";
}

function useTokens(file) {
  const [tokens, setTokens] = useState({});
  useEffect(() => {
    let cancelled = false;
    highlighterPromise ??= createHighlighter({ themes: ["github-dark"], langs: ["javascript", "jsx", "typescript", "tsx", "css", "json", "markdown", "python", "csharp", "bash", "yaml", "text"] });
    highlighterPromise.then((highlighter) => {
      const result = {};
      for (const [side, content] of [["LEFT", file.baseContent?.text], ["RIGHT", file.headContent?.text]]) {
        if (typeof content === "string") {
          result[side] = highlighter.codeToTokens(content, { lang: language(file.path), theme: "github-dark" }).tokens;
        }
      }
      if (!cancelled) {
        setTokens(result);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [file]);
  return tokens;
}

export default function DiffFile({ file, split, ignoreWhitespace, selection, onSelect, anchorRevision, leftRevision, view, onView, notes, draft, onDraft, onUpdate, onCancel, onJump }) {
  const { context, full, fullSide } = view;
  const tokens = useTokens(file);
  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const skipClick = useRef(false);
  const rangeOrigin = useRef(null);
  const [dragSelection, setDragSelection] = useState(null);
  const available = typeof file.baseContent?.text === "string" && typeof file.headContent?.text === "string";
  const hunks = useMemo(() => makeHunks(file, context, ignoreWhitespace), [file, context, ignoreWhitespace]);
  const fullLines = full && available ? (fullSide === "LEFT" ? file.baseContent.text : file.headContent.text).split("\n") : null;
  const visibleLines = new Set();
  if (fullLines) {
    fullLines.forEach((text, index) => visibleLines.add(`${fullSide}:${index + 1}`));
  } else {
    for (const hunk of hunks) {
      for (const row of numberedLines(hunk)) {
        if (row.oldLine !== null) {
          visibleLines.add(`LEFT:${row.oldLine}`);
        }
        if (row.newLine !== null) {
          visibleLines.add(`RIGHT:${row.newLine}`);
        }
      }
    }
  }
  const placement = placeComments(notes, draft, visibleLines, anchorRevision, leftRevision);

  function threadsAt(key) {
    const group = placement.groups.get(key) ?? [];
    const showComposer = placement.draftLine === key;
    if (!group.length && !showComposer) {
      return null;
    }
    return <div key={key} data-comment-line={key}>
      <NoteThreads filePath={file.path} revision={anchorRevision} notes={group} draft={draft} onDraft={onDraft} onUpdate={onUpdate} onCancel={onCancel} onJump={onJump} showComposer={showComposer} inline={true} />
    </div>;
  }

  function inlineComments(oldLine, newLine) {
    const left = oldLine !== null ? threadsAt(`LEFT:${oldLine}`) : null;
    const right = newLine !== null ? threadsAt(`RIGHT:${newLine}`) : null;
    if (!left && !right) {
      return null;
    }
    return <div className={`inline-comment-row ${split && !full ? "inline-comment-split" : ""}`}>
      {split && !full ? <><div>{left}</div><div>{right}</div></> : <>{left}{right}</>}
    </div>;
  }

  function selectRange(side, origin, line, text) {
    const start = Math.min(origin, line);
    const end = Math.max(origin, line);
    const content = side === "LEFT" ? file.baseContent?.text : file.headContent?.text;
    const excerpt = typeof content === "string" ? content.split("\n").slice(start - 1, end).join("\n") : hunks.flatMap(numberedLines).filter((row) => {
      const number = side === "LEFT" ? row.oldLine : row.newLine;
      return number !== null && number >= start && number <= end;
    }).map((row) => row.text).join("\n") || text;
    onSelect({ side, start, end, excerpt, revision: side === "LEFT" ? leftRevision : anchorRevision });
  }

  function lineButton(side, line, text) {
    if (line === null) {
      return <span className="line-number empty" />;
    }
    const activeSelection = dragSelection ?? selection;
    const selected = activeSelection?.side === side && line >= activeSelection.start && line <= activeSelection.end;
    return <button type="button" data-side={side} data-line={line} title={`Comment on line ${line}; drag or Shift-click for a range`} className={`line-number ${selected ? "selected-line" : ""}`} aria-label={`${side === "LEFT" ? "Old" : "New"} line ${line} in ${file.path}`} aria-pressed={selected || false} onPointerDown={(event) => {
      skipClick.current = false;
      if (event.button !== 0 || event.pointerType !== "mouse") {
        return;
      }
      dragRef.current = { side, origin: line, end: line };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={(event) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("button[data-line][data-side]");
      if (!target || !rootRef.current?.contains(target) || target.dataset.side !== drag.side) {
        return;
      }
      const end = Number(target.dataset.line);
      if (end !== drag.end) {
        drag.end = end;
        setDragSelection({ side: drag.side, start: Math.min(drag.origin, end), end: Math.max(drag.origin, end) });
      }
    }} onPointerUp={() => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragSelection(null);
      if (drag && drag.origin !== drag.end) {
        skipClick.current = true;
        rangeOrigin.current = { side: drag.side, line: drag.origin };
        selectRange(drag.side, drag.origin, drag.end, text);
      }
    }} onPointerCancel={() => {
      dragRef.current = null;
      setDragSelection(null);
    }} onClick={(event) => {
      if (skipClick.current) {
        skipClick.current = false;
        return;
      }
      const origin = event.shiftKey && selection?.side === side ? (rangeOrigin.current?.side === side ? rangeOrigin.current.line : selection.start) : line;
      rangeOrigin.current = { side, line: origin };
      selectRange(side, origin, line, text);
    }}><span className="line-add" aria-hidden="true">+</span>{line}</button>;
  }

  function source(row, side) {
    if (!row) {
      return <span className="code-text" />;
    }
    const number = side === "LEFT" ? row.oldLine : row.newLine;
    const highlighted = tokens[side]?.[number - 1];
    return <span className="code-text">{highlighted ? highlighted.map((token, index) => <span key={index} style={{ color: token.color }}>{token.content}</span>) : row.text}</span>;
  }

  return <div className="review-diff" ref={rootRef}>
    <div className="diff-controls">
      <button type="button" disabled={!available || full || context >= 10003} onClick={() => onView({ ...view, context: context + 20 })}>Expand context (+20)</button>
      <button type="button" disabled={!available} onClick={() => onView({ ...view, full: !full })}>{full ? "Show diff" : "View full file"}</button>
      {full && <select aria-label={`Full file side for ${file.path}`} value={fullSide} onChange={(event) => onView({ ...view, fullSide: event.target.value })}><option value="LEFT">Old file</option><option value="RIGHT">New file</option></select>}
      <span className="review-muted">Drag across line numbers, or click the first line and Shift-click the last, to comment on a range.</span>
    </div>
    {!available && <p className="review-muted">{file.comparisonUnavailable ? "Cannot compare these revisions: full content is missing. Sync both revisions to compare them." : "Full context unavailable in this snapshot. Sync to fetch file contents."} {file.baseContent?.error || file.headContent?.error}</p>}
    {!available && ignoreWhitespace && <p className="review-muted">Whitespace filtering requires full file content; displaying the imported patch.</p>}
    {full && available ? <div className="diff-code" role="region" aria-label={`Full file ${file.path}`}>
      {fullLines.map((text, index) => <Fragment key={index}><div className="unified-row full-row">
        {lineButton(fullSide, index + 1, text)}{source({ text, oldLine: index + 1, newLine: index + 1 }, fullSide)}
      </div>{inlineComments(fullSide === "LEFT" ? index + 1 : null, fullSide === "RIGHT" ? index + 1 : null)}</Fragment>)}
    </div> : hunks.length ? hunks.map((hunk, index) => {
      const lines = numberedLines(hunk);
      return <div className="diff-code" key={index} role="region" aria-label={`Diff hunk ${index + 1} in ${file.path}`}>
        <div className="hunk-header">{hunk.header}</div>
        {split ? <>
          <div className="split-labels"><span>Old</span><span>New</span></div>
          {splitRows(lines).map((row, rowIndex) => <Fragment key={rowIndex}><div className="split-row">
            <div className={`split-cell ${row.left?.marker === "-" ? "removed" : ""}`}>{lineButton("LEFT", row.left?.oldLine ?? null, row.left?.text)}{source(row.left, "LEFT")}</div>
            <div className={`split-cell ${row.right?.marker === "+" ? "added" : ""}`}>{lineButton("RIGHT", row.right?.newLine ?? null, row.right?.text)}{source(row.right, "RIGHT")}</div>
          </div>{inlineComments(row.left?.oldLine ?? null, row.right?.newLine ?? null)}</Fragment>)}
        </> : lines.map((row, rowIndex) => <Fragment key={rowIndex}><div className={`unified-row ${row.marker === "+" ? "added" : row.marker === "-" ? "removed" : ""}`}>
          {lineButton("LEFT", row.oldLine, row.text)}{lineButton("RIGHT", row.newLine, row.text)}<span className="line-marker">{row.marker}</span>{source(row, row.marker === "-" ? "LEFT" : "RIGHT")}
        </div>{inlineComments(row.oldLine, row.newLine)}</Fragment>)}
      </div>;
    }) : <p className="review-muted">{file.comparisonUnavailable ? "No comparison available." : ignoreWhitespace ? "No changes after ignoring leading and trailing whitespace." : "No textual changes."}</p>}
    {(placement.remaining.length > 0 || (draft.open && !placement.draftLine)) && <div className="comments-outside-diff">
      {(placement.remaining.some((note) => note.anchor) || (draft.open && draft.anchor && !placement.draftLine)) && <p className="review-muted">Comments outside the displayed lines. Expand context or view the original snapshot to see their code.</p>}
      <NoteThreads filePath={file.path} revision={anchorRevision} notes={placement.remaining} draft={draft} onDraft={onDraft} onUpdate={onUpdate} onCancel={onCancel} onJump={onJump} showComposer={!placement.draftLine} inline={false} />
    </div>}
  </div>;
}
