import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalReview } from "./ReviewProvider.jsx";
import FinalReview from "./FinalReview.jsx";
import { draftKey } from "./state.js";
import { comparisonFiles } from "./diff.js";
import DiffFile from "./DiffFile.jsx";
import NoteThreads, { newDraft } from "./NoteThreads.jsx";
import Markdown from "./Markdown.jsx";

export default function ReviewWorkspace({ details, diff, revisions, active, navigationTarget }) {
  const { state, ready, status, error, update, retry } = useLocalReview();
  const [viewedRevision, setViewedRevision] = useState(details.revision);
  const [query, setQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selection, setSelection] = useState({});
  const [restored, setRestored] = useState(false);
  const [jumpTarget, setJumpTarget] = useState(null);
  const fileElements = useRef(new Map());
  const positionRef = useRef(null);
  const updateRef = useRef(update);
  const lastNavigation = useRef(null);
  updateRef.current = update;
  const snapshot = revisions[viewedRevision] ?? { details, diff };
  const revision = snapshot.details.revision;
  const baseline = revisions[state.baselineRevision];
  const sinceReview = Boolean(state.preferences.sinceReview && baseline);
  const files = useMemo(() => sinceReview ? comparisonFiles(snapshot.diff, baseline.diff, state.baselineRevision) : snapshot.diff.files, [sinceReview, snapshot.diff, baseline, state.baselineRevision]);
  const visibleFiles = files.filter((file) => file.path.toLowerCase().includes(query.toLowerCase()));
  const isReviewed = (file) => state.reviewed[file.path]?.fingerprint === file.fingerprint;
  const reviewedCount = snapshot.diff.files.filter(isReviewed).length;

  useEffect(() => {
    if (!active || !ready || restored || jumpTarget) {
      return;
    }
    const saved = state.positions[revision];
    const frame = requestAnimationFrame(() => {
      if (window.location.hash === "#top") {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      } else if (saved) {
        const element = fileElements.current.get(saved.filePath);
        if (element) {
          window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top + saved.offset);
          setSelectedFile(saved.filePath);
        }
      }
      setRestored(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, ready, restored, revision, state.positions, jumpTarget]);

  useEffect(() => {
    if (!active || !ready || !jumpTarget) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const file = fileElements.current.get(jumpTarget.filePath);
      const line = [...(file?.querySelectorAll("button[data-line]") ?? [])].find((element) => element.dataset.side === jumpTarget.side && Number(element.dataset.line) === jumpTarget.start);
      (line ?? file)?.scrollIntoView({ block: "center" });
      setSelectedFile(jumpTarget.filePath);
      setRestored(true);
      setJumpTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, ready, jumpTarget, revision]);

  useEffect(() => {
    if (!active || !ready || !restored) {
      return;
    }
    let timer;
    function savePosition() {
      if (positionRef.current) {
        updateRef.current({ type: "position", revision, position: positionRef.current });
      }
    }
    function onScroll() {
      const entries = [...fileElements.current.entries()].filter(([, element]) => element);
      const entry = entries.filter(([, element]) => element.getBoundingClientRect().bottom > 0).sort((left, right) => Math.abs(left[1].getBoundingClientRect().top) - Math.abs(right[1].getBoundingClientRect().top))[0];
      if (entry) {
        positionRef.current = { filePath: entry[0], offset: -entry[1].getBoundingClientRect().top };
        setSelectedFile(entry[0]);
        clearTimeout(timer);
        timer = setTimeout(savePosition, 250);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", savePosition);
    return () => {
      clearTimeout(timer);
      savePosition();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", savePosition);
    };
  }, [active, ready, restored, revision]);

  function goTo(filePath) {
    const view = state.fileViews?.[draftKey(revision, filePath)] ?? { context: 3, full: false, fullSide: "RIGHT" };
    if (view.collapsed) {
      update({ type: "fileView", revision, filePath, view: { ...view, collapsed: false } });
    }
    setSelectedFile(filePath);
    fileElements.current.get(filePath)?.scrollIntoView({ block: "start" });
  }

  function nextUnreviewed() {
    const index = visibleFiles.findIndex((file) => file.path === selectedFile);
    const ordered = [...visibleFiles.slice(index + 1), ...visibleFiles.slice(0, index + 1)];
    const next = ordered.find((file) => !isReviewed(file));
    if (next) {
      goTo(next.path);
    }
  }

  function preference(key, value) {
    update({ type: "preferences", preferences: { [key]: value } });
  }

  function switchRevision(value) {
    setViewedRevision(value);
    setRestored(false);
    positionRef.current = null;
    setSelection({});
  }

  function jumpToNote(note) {
    const target = note.anchor?.revision ?? note.revision;
    const historical = revisions[target];
    if (!historical) {
      return;
    }
    const file = historical.diff.files.find((file) => file.path === note.filePath || file.oldPath === note.filePath);
    const filePath = file?.path ?? note.filePath;
    const side = note.anchor?.sourceSide ?? note.anchor?.side ?? "RIGHT";
    switchRevision(target);
    preference("sinceReview", false);
    update({ type: "fileView", revision: target, filePath, view: { context: 3, full: true, fullSide: side, collapsed: false } });
    setQuery("");
    setSelection({ [filePath]: { ...note.anchor, side } });
    setJumpTarget({ filePath, side, start: note.anchor?.start ?? 1 });
  }

  useEffect(() => {
    if (active && ready && navigationTarget && lastNavigation.current !== navigationTarget) {
      lastNavigation.current = navigationTarget;
      jumpToNote({ revision: navigationTarget.revision, filePath: navigationTarget.path, anchor: { side: navigationTarget.side, start: navigationTarget.start, end: navigationTarget.end, excerpt: navigationTarget.excerpt } });
    }
  }, [active, ready, navigationTarget]);

  useEffect(() => {
    function onKeyDown(event) {
      if (!active || !ready || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.target.closest("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        nextUnreviewed();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, ready, files, query, selectedFile, state.reviewed]);

  if (!ready) {
    return <div className="review-loading">{error ? <><p role="alert">{error}</p><button onClick={retry}>Retry loading review</button></> : "Loading review…"}</div>;
  }

  return <section className="review-workspace">
    <div className="review-toolbar">
      <div className="context-heading"><strong>Review · {reviewedCount}/{snapshot.diff.files.length} files reviewed</strong><span role="status">{status}</span></div>
      {error && <p role="alert">Your changes have not been saved: {error} <button onClick={retry}>Retry saving</button></p>}
      <div className="review-options">
        <button type="button" aria-keyshortcuts="N" title="Next unreviewed file (N)" onClick={nextUnreviewed} disabled={!visibleFiles.some((file) => !isReviewed(file))}>Next unreviewed file</button>
        <label><input type="checkbox" checked={state.preferences.split ?? false} onChange={(event) => preference("split", event.target.checked)} /> Split view</label>
        <label><input type="checkbox" checked={state.preferences.ignoreWhitespace ?? false} onChange={(event) => preference("ignoreWhitespace", event.target.checked)} /> Ignore whitespace</label>
        <label><input type="checkbox" checked={sinceReview} disabled={!baseline} onChange={(event) => preference("sinceReview", event.target.checked)} /> Changes since last review</label>
      </div>
      <div className="review-options">
        <label>Snapshot <select aria-label="Snapshot" value={viewedRevision} onChange={(event) => switchRevision(event.target.value)}>{Object.entries(revisions).map(([key, value]) => <option key={key} value={key}>{key.slice(0, 8)}{key === details.revision ? " (current)" : ""} · {value.details.syncedAt ? new Date(value.details.syncedAt).toLocaleString() : "Imported snapshot"}</option>)}</select></label>
        <label>Review baseline <select aria-label="Review baseline" value={state.baselineRevision ?? ""} onChange={(event) => update({ type: "baseline", revision: event.target.value })}>
          <option value="" disabled>Mark a file reviewed or choose a snapshot</option>{Object.keys(revisions).map((key) => <option key={key} value={key}>{key.slice(0, 8)}</option>)}
        </select></label>
        <button type="button" onClick={() => update({ type: "baseline", revision })}>Use this snapshot as baseline</button>
      </div>
      <p className="review-muted">{details.syncedAt ? `Last synced ${new Date(details.syncedAt).toLocaleString()}.` : "This is a legacy snapshot; sync for full context and commit history."}</p>
      {viewedRevision !== details.revision && <p className="revision-warning">Viewing an earlier snapshot. <button onClick={() => switchRevision(details.revision)}>Return to current snapshot</button></p>}
      {sinceReview && <p className="revision-warning">Comparing {state.baselineRevision.slice(0, 8)} → {revision.slice(0, 8)}. Old lines belong to the baseline snapshot.</p>}
    </div>
    <div className="review-layout">
      <aside className="review-sidebar" aria-label="Changed files">
        <input type="search" aria-label="Search changed files" placeholder="Search files" value={query} onChange={(event) => setQuery(event.target.value)} />
        {visibleFiles.map((file) => <button type="button" key={file.path} className={selectedFile === file.path ? "active" : ""} onClick={() => goTo(file.path)}>
          <span>{isReviewed(file) ? "✓" : state.reviewed[file.path] ? "↻" : "○"}</span><span>{file.path}</span>
        </button>)}
      </aside>
      <div className="review-files">
        {visibleFiles.length === 0 && <p className="empty-state">{query ? "No matching files." : sinceReview ? "No changes since the review baseline." : "No changed files."}</p>}
        {visibleFiles.map((file) => {
          const draft = state.drafts[draftKey(revision, file.path)] ?? newDraft();
          const view = state.fileViews?.[draftKey(revision, file.path)] ?? { context: 3, full: false, fullSide: "RIGHT", collapsed: false };
          const isCollapsed = view.collapsed ?? false;
          const notes = state.notes.filter((note) => note.filePath === file.path || note.filePath === file.oldPath);
          const stale = state.reviewed[file.path] && !isReviewed(file);
          const onDraft = (value) => update({ type: "draft", filePath: file.path, revision, draft: value });
          return <article className="review-file" key={file.path} ref={(element) => { if (element) { fileElements.current.set(file.path, element); } else { fileElements.current.delete(file.path); } }}>
            <header className="review-file-header">
              <button type="button" aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${file.path}`} aria-expanded={!isCollapsed} onClick={() => update({ type: "fileView", revision, filePath: file.path, view: { ...view, collapsed: !isCollapsed } })}>{isCollapsed ? "▸" : "▾"}</button>
              <strong>{file.path}</strong><span className="review-badge">{file.status}</span>
              {stale && <span className="revision-warning">Changed since you reviewed it</span>}
              <button type="button" onClick={() => onDraft({ ...draft, open: true, anchor: null })}>File comment</button>
              <label><input type="checkbox" aria-label={`Reviewed ${file.path}`} checked={isReviewed(file)} onChange={(event) => update({ type: "reviewed", filePath: file.path, revision, fingerprint: file.fingerprint ?? "unavailable", value: event.target.checked })} /> Reviewed</label>
            </header>
            {!isCollapsed && <DiffFile file={file} notes={notes} draft={draft} onDraft={onDraft} onUpdate={update} onCancel={() => onDraft(newDraft())} onJump={jumpToNote} view={view} onView={(view) => update({ type: "fileView", revision, filePath: file.path, view })} split={state.preferences.split ?? false} ignoreWhitespace={state.preferences.ignoreWhitespace ?? false} selection={selection[file.path] ?? draft.anchor} anchorRevision={revision} leftRevision={sinceReview ? state.baselineRevision : revision} onSelect={(anchor) => {
              const value = { ...anchor, sourceSide: sinceReview && anchor.side === "LEFT" ? "RIGHT" : anchor.side };
              setSelection((current) => ({ ...current, [file.path]: value }));
              onDraft({ ...draft, open: true, anchor: value });
            }} />}
            {isCollapsed && <NoteThreads filePath={file.path} revision={revision} notes={notes} draft={draft} onDraft={onDraft} onUpdate={update} onCancel={() => onDraft(newDraft())} onJump={jumpToNote} showComposer={true} inline={false} />}
          </article>;
        })}
        {state.notes.some((note) => !files.some((file) => file.path === note.filePath || file.oldPath === note.filePath)) && <details className="archived-notes"><summary>Notes on files outside this view</summary>
          {[...new Set(state.notes.filter((note) => !files.some((file) => file.path === note.filePath || file.oldPath === note.filePath)).map((note) => note.filePath))].map((filePath) => <section key={filePath}><h3>{filePath}</h3><NoteThreads filePath={filePath} revision={revision} notes={state.notes.filter((note) => note.filePath === filePath)} draft={state.drafts[draftKey(revision, filePath)] ?? newDraft()} onDraft={(draft) => update({ type: "draft", filePath, revision, draft })} onUpdate={update} onCancel={() => {}} onJump={jumpToNote} showComposer={true} inline={false} /></section>)}
        </details>}
      </div>
    </div>
    {details.legacyNotes?.length > 0 && <details className="archived-notes"><summary>Legacy notes for PR #{details.number}</summary>
      <p className="review-muted">These older notes did not record a repository or commit. Their original contents are preserved here.</p>
      {details.legacyNotes.map((note) => <div className="context-entry" key={note.id}><strong>{note.filePath} · {note.author}</strong><Markdown>{note.body}</Markdown></div>)}
    </details>}
    <FinalReview key={revision} revision={revision} currentRevision={details.revision} reviewedCount={reviewedCount} fileCount={snapshot.diff.files.length} />
  </section>;
}
