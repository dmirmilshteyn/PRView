import { useEffect, useState } from "react";
import AssignSelfDialog from "./AssignSelfDialog.jsx";
import ReviewerDialog from "./ReviewerDialog.jsx";

export default function PRHotkeys({ link, repository, number, onAssigned, onReviewerRequested }) {
  const [toast, setToast] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reviewerOpen, setReviewerOpen] = useState(false);

  useEffect(() => {
    const pressed = new Set();
    let timer;
    let active = true;
    let copying = false;

    function reset() {
      pressed.clear();
    }

    async function onKeyDown(event) {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector("dialog[open]") || event.target.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']")) {
        reset();
        return;
      }
      if (event.repeat) {
        return;
      }
      const key = event.key.toLowerCase();
      pressed.add(key);
      if (pressed.has("e") && pressed.has("r") && pressed.size === 2) {
        event.preventDefault();
        reset();
        setReviewerOpen(true);
        return;
      }
      if (pressed.has("e") && pressed.has("a") && pressed.size === 2) {
        event.preventDefault();
        reset();
        setAssignOpen(true);
        return;
      }
      if (!pressed.has("c") || !pressed.has("g") || pressed.size !== 2 || copying) {
        return;
      }
      event.preventDefault();
      reset();
      copying = true;
      clearTimeout(timer);
      setToast(null);
      try {
        await navigator.clipboard.writeText(link);
        if (active) {
          setToast("GitHub PR link copied");
        }
      } catch {
        if (active) {
          setToast("Could not copy the GitHub PR link");
        }
      } finally {
        copying = false;
        if (active) {
          timer = setTimeout(() => setToast(null), 3000);
        }
      }
    }

    function onKeyUp(event) {
      pressed.delete(event.key.toLowerCase());
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", reset);
    window.addEventListener("focusin", reset);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", reset);
      window.removeEventListener("focusin", reset);
    };
  }, [link]);

  return <>
    {assignOpen && <AssignSelfDialog repository={repository} number={number} onClose={() => setAssignOpen(false)} onAssigned={onAssigned} />}
    {reviewerOpen && <ReviewerDialog repository={repository} number={number} onClose={() => setReviewerOpen(false)} onRequested={onReviewerRequested} />}
    <div className="pr-hotkey-toast" role="status" aria-live="polite" aria-atomic="true">{toast && <span>{toast}</span>}</div>
  </>;
}
