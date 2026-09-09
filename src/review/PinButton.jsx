import { usePins } from "./PinProvider.jsx";

export default function PinButton({ number }) {
  const { pins, pending, toggle, available } = usePins();
  const pinned = pins.has(number);
  return <button className={`pr-pin ${pinned ? "is-pinned" : ""}`} type="button" aria-label={`${pinned ? "Unpin" : "Pin"} PR #${number}`} aria-pressed={pinned} disabled={pending.has(number) || !available.has(number)} onClick={() => toggle(number)}>
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h6l-1 4 2 2v1H4V8l2-2-1-4Z" fill={pinned ? "currentColor" : "none"} /><path d="M8 9v5" /></svg>
    {pending.has(number) ? "Saving…" : pinned ? "Pinned" : "Pin"}
  </button>;
}
