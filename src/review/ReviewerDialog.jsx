import { useEffect, useRef, useState } from "react";

export default function ReviewerDialog({ repository, number, onClose, onRequested }) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const active = useRef(false);
  const inFlight = useRef(false);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const search = query.trim().replace(/^@/, "").toLowerCase();
  const matches = users.filter((user) => !user.requested && user.login.toLowerCase().includes(search))
    .sort((left, right) => Number(right.login.toLowerCase().startsWith(search)) - Number(left.login.toLowerCase().startsWith(search)))
    .slice(0, 20);
  const candidate = matches[selected];

  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    active.current = true;
    dialog.showModal();
    inputRef.current.focus();
    return () => {
      active.current = false;
      dialog.close();
      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      setUsers([]);
      try {
        const response = await fetch(`/api/reviewers?${new URLSearchParams({ repository, number })}`, { signal: controller.signal, cache: "no-store" });
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("The reviewer service is unavailable. Please try again.");
        }
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Could not load eligible reviewers");
        }
        if (!controller.signal.aborted) {
          setUsers(result.users);
          setSelected(0);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [repository, number, retry]);

  useEffect(() => {
    dialogRef.current?.querySelector(`[id="reviewer-option-${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  async function requestReviewer(user) {
    if (!user || loading || inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/reviewers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, number, login: user.login }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The reviewer service is unavailable. Please try again.");
      }
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not request this reviewer");
      }
      if (active.current) {
        onRequested(result);
        onClose();
      }
    } catch (failure) {
      if (active.current) {
        setError(failure.message);
      }
    } finally {
      inFlight.current = false;
      if (active.current) {
        setBusy(false);
      }
    }
  }

  return <dialog ref={dialogRef} className="pr-confirm-dialog reviewer-dialog" aria-labelledby="reviewer-heading" aria-describedby="reviewer-description" aria-busy={busy || loading} onCancel={(event) => {
    event.preventDefault();
    if (!inFlight.current) {
      onClose();
    }
  }} onKeyDown={(event) => event.stopPropagation()}>
    <h2 id="reviewer-heading">Request a reviewer</h2>
    <p id="reviewer-description">Choose an organization member or repository collaborator for {repository}#{number}.</p>
    <label className="stack-sr-only" htmlFor="reviewer-username">GitHub username</label>
    <input ref={inputRef} id="reviewer-username" className="reviewer-search" role="combobox" aria-autocomplete="list" aria-expanded={!loading && matches.length > 0} aria-controls="reviewer-suggestions" aria-activedescendant={candidate ? `reviewer-option-${selected}` : undefined} autoComplete="off" spellCheck={false} placeholder="Type a GitHub username…" disabled={busy} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) {
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((index) => matches.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (!event.repeat) {
          requestReviewer(candidate);
        }
      }
    }} />
    <div className="reviewer-suggestions" id="reviewer-suggestions" role="listbox" aria-label="Eligible reviewers">
      {!loading && matches.map((user, index) => <div id={`reviewer-option-${index}`} role="option" aria-selected={index === selected} className={`reviewer-option ${index === selected ? "selected" : ""}`} key={user.login} onMouseDown={(event) => event.preventDefault()} onMouseMove={() => setSelected(index)} onClick={() => requestReviewer(user)}>
        <span className="reviewer-avatar" aria-hidden="true">{user.login.slice(0, 1).toUpperCase()}</span><strong>{user.login}</strong><span className="reviewer-add" aria-hidden="true">＋</span>
      </div>)}
    </div>
    <p className="review-muted" role="status">{loading ? "Loading eligible reviewers…" : busy ? `Requesting ${candidate?.login ?? "reviewer"}…` : !matches.length ? "No eligible, unrequested reviewers match this username." : "↑ ↓ to choose · Enter to request review"}</p>
    {error && <p className="pr-refresh-error" role="alert">{error} <button type="button" disabled={busy || loading} onClick={() => setRetry((value) => value + 1)}>Reload reviewers</button></p>}
    <div className="pr-confirm-actions">
      <button type="button" disabled={busy} onClick={onClose}>Cancel <kbd title="Escape" aria-label="Escape">⎋</kbd></button>
      <button className="pr-confirm-primary" type="button" disabled={busy || loading || !candidate} onClick={() => requestReviewer(candidate)}>Add reviewer <kbd title="Enter" aria-label="Enter">↵</kbd></button>
    </div>
  </dialog>;
}
