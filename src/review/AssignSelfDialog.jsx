import { useEffect, useRef, useState } from "react";

export default function AssignSelfDialog({ repository, number, onClose, onAssigned }) {
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);
  const inFlight = useRef(false);
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    active.current = true;
    dialog.showModal();
    confirmRef.current.focus();
    return () => {
      active.current = false;
      dialog.close();
      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  async function confirm() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/assign-self", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, number }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The assignment service is unavailable. Please try again.");
      }
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not assign you to this PR");
      }
      if (active.current) {
        onAssigned(result);
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

  return <dialog ref={dialogRef} className="pr-confirm-dialog" aria-labelledby="assign-self-heading" aria-describedby="assign-self-description" aria-busy={busy} onCancel={(event) => {
    event.preventDefault();
    if (!inFlight.current) {
      onClose();
    }
  }} onKeyDown={(event) => {
    event.stopPropagation();
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!event.repeat) {
        confirm();
      }
    }
  }}>
    <h2 id="assign-self-heading">Assign yourself to this PR?</h2>
    <p id="assign-self-description">Add your signed-in GitHub account as an assignee on {repository}#{number}.</p>
    {error && <p className="pr-refresh-error" role="alert">{error}</p>}
    <div className="pr-confirm-actions">
      <button type="button" disabled={busy} onClick={onClose}>Cancel <kbd title="Escape" aria-label="Escape">⎋</kbd></button>
      <button ref={confirmRef} className="pr-confirm-primary" type="button" disabled={busy} onClick={confirm}>{busy ? "Assigning…" : "Confirm"} <kbd title="Enter" aria-label="Enter">↵</kbd></button>
    </div>
  </dialog>;
}
