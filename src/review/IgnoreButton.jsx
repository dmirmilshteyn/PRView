import { usePins } from "./PinProvider.jsx";

export default function IgnoreButton({ number, iconOnly }) {
  const { ignored, pending, toggleIgnored, available } = usePins();
  const isIgnored = ignored.has(number);
  const label = `${isIgnored ? "Unignore" : "Ignore"} PR #${number}`;
  return <button className={`pr-pin pr-ignore ${isIgnored ? "is-ignored" : ""}`} type="button" title={pending.has(number) ? "Saving…" : label} aria-label={label} aria-pressed={isIgnored} aria-busy={pending.has(number)} disabled={pending.has(number) || !available.has(number)} onClick={() => toggleIgnored(number)}>
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.5 5.5A11 11 0 0 1 12 5c7 0 10 7 10 7a17 17 0 0 1-3 4M6 6a19 19 0 0 0-4 6s3 7 10 7a12 12 0 0 0 5-1" /></svg>
    {!iconOnly && (pending.has(number) ? "Saving…" : isIgnored ? "Ignored" : "Ignore")}
  </button>;
}
