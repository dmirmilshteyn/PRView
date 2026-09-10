import { useEffect, useRef, useState } from "react";

export default function AutoMergeToggle({ repository, number, syncedAt }) {
  const [status, setStatus] = useState(null);
  const [method, setMethod] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setStatus(null);
    setError(null);
    async function load() {
      try {
        const response = await fetch(`/api/auto-merge?${new URLSearchParams({ repository, number })}`, { signal: controller.signal, cache: "no-store" });
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("The auto-merge service is unavailable. Use Refresh to try again.");
        }
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Could not load auto-merge status");
        }
        setStatus(result);
        setMethod(result.mergeMethod || result.methods[0] || "");
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure.message);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [repository, number, syncedAt]);

  async function toggle() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auto-merge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, number, enabled: !status.enabled, mergeMethod: method }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The auto-merge service is unavailable. Use Refresh before trying again.");
      }
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not change auto-merge");
      }
      setStatus(result);
    } catch (failure) {
      setError(failure.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="auto-merge-control">
    <h2>Auto-merge</h2>
    <div className="review-options">
      <label><input type="checkbox" role="switch" checked={status?.enabled ?? false} onChange={toggle}
        disabled={busy || !status || (status.enabled ? !status.canDisable : !status.canEnable || !method)} />
        Auto-merge {status ? status.enabled ? "on" : "off" : "status unavailable"}
      </label>
      {status && !status.enabled && status.canEnable && <select aria-label="Auto-merge method" value={method} onChange={(event) => setMethod(event.target.value)} disabled={busy}>
        {status.methods.map((value) => <option key={value} value={value}>{({ SQUASH: "Squash and merge", MERGE: "Merge commit", REBASE: "Rebase and merge" })[value]}</option>)}
      </select>}
      <span role="status">{busy ? "Updating GitHub…" : !status && !error ? "Loading from GitHub…" : status?.enabled ? `Method: ${status.mergeMethod?.toLowerCase()}` : ""}</span>
    </div>
    {status && !(status.enabled ? status.canDisable : status.canEnable) && <p className="review-muted">GitHub does not allow you to {status.enabled ? "disable" : "enable"} auto-merge for this PR.</p>}
    {error && <p role="alert" className="pr-refresh-error">{error}</p>}
  </div>;
}
