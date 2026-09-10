import { useEffect, useState } from "react";
import AssignSelfDialog from "./AssignSelfDialog.jsx";
import ReviewerDialog from "./ReviewerDialog.jsx";
import HotkeyHelp from "./HotkeyHelp.jsx";
import { createHotkeyMatcher } from "./hotkey-matcher.js";
import { useRouter } from "next/navigation";
import { nextStackPullRequest, previousStackPullRequest } from "../stack/stack.js";

export default function PRHotkeys({ link, repository, number, onAssigned, onReviewerRequested, stack }) {
  const router = useRouter();
  const [toast, setToast] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reviewerOpen, setReviewerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const matcher = createHotkeyMatcher();
    let timer;
    let active = true;
    let copying = false;

    function reset() {
      matcher.reset();
    }

    async function onKeyDown(event) {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]") || event.target.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']")) {
        reset();
        return;
      }
      if (event.repeat) {
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        reset();
        setHelpOpen(true);
        return;
      }
      if (event.shiftKey) {
        reset();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "[" || key === "]") {
        const target = key === "[" ? previousStackPullRequest(stack, number) : nextStackPullRequest(stack, number);
        reset();
        if (target) {
          event.preventDefault();
          router.push(`/pull-requests/${target.number}#top`, { scroll: true });
        }
        return;
      }
      const action = matcher.keyDown(key, performance.now());
      if (action === "reviewer") {
        event.preventDefault();
        reset();
        setReviewerOpen(true);
        return;
      }
      if (action === "assign") {
        event.preventDefault();
        reset();
        setAssignOpen(true);
        return;
      }
      if (action !== "copy" || copying) {
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
      matcher.keyUp(event.key.toLowerCase());
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
  }, [link, stack, number, router]);

  return <>
    <button className="hotkey-help-button pr-pin" type="button" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setHelpOpen(true)}>?</button>
    {helpOpen && <HotkeyHelp onClose={() => setHelpOpen(false)} />}
    {assignOpen && <AssignSelfDialog repository={repository} number={number} onClose={() => setAssignOpen(false)} onAssigned={onAssigned} />}
    {reviewerOpen && <ReviewerDialog repository={repository} number={number} onClose={() => setReviewerOpen(false)} onRequested={onReviewerRequested} />}
    <div className="pr-hotkey-toast" role="status" aria-live="polite" aria-atomic="true">{toast && <span>{toast}</span>}</div>
  </>;
}
