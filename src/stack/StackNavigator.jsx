import Link from "next/link";
import { stackEntryStatus } from "./stack.js";
import StackSignal from "./StackSignal.jsx";

export default function StackNavigator({ stack, repository, currentNumber }) {
  if (!stack) {
    return null;
  }
  return <nav className="pr-stack" aria-label="Pull request stack">
    <div className="stack-heading"><span>Stack{stack.number ? ` #${stack.number}` : ""}</span><span>{stack.entries.length} PRs</span></div>
    <ol className="stack-entries">
      {stack.entries.map((entry) => {
        const status = stackEntryStatus(entry);
        const current = Number(currentNumber) === entry.number;
        const contents = <>
          <span className={`stack-node ${status.kind}`} aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" />{status.kind === "merged" ? <path d="m5 8 2 2 4-4" /> : status.kind === "closed" ? <path d="m6 6 4 4m0-4-4 4" /> : status.kind !== "ready" ? <path d="M8 4.5V8l2 1.5" /> : null}</svg>
          </span>
          <span className="stack-entry-text"><span className="stack-entry-title">{entry.title}</span><span className="stack-entry-meta">#{entry.number} · {entry.branch}{!entry.available && " · Open on GitHub ↗"}</span></span>
          <span className="stack-badges">
            {status.kind !== "ready" && <span className={`stack-status ${status.kind}`} title={status.description}>{status.label}</span>}
            <StackSignal label="Approval" kind={entry.approved ? "success" : "none"} description={entry.approved ? "At least one approval" : "No synced approval"} />
            <StackSignal label="CI" kind={entry.ci ?? "none"} description={({ success: "CI passed (including neutral or skipped checks)", failure: "CI failed", pending: "CI pending", none: "No synced CI checks" })[entry.ci ?? "none"]} />
          </span>
        </>;
        return <li key={entry.number} className={current ? "stack-current" : ""}>
          {entry.available ? <Link className="stack-entry" href={`/pull-requests/${entry.number}`} aria-current={current ? "page" : undefined}>{contents}</Link> : <a className="stack-entry" href={`https://github.com/${repository}/pull/${entry.number}`} target="_blank" rel="noreferrer">{contents}</a>}
        </li>;
      })}
    </ol>
    <div className="stack-trunk"><span aria-hidden="true" className="stack-trunk-node" /><code>{stack.baseBranch}</code><span className="stack-sr-only">Base branch</span></div>
  </nav>;
}
