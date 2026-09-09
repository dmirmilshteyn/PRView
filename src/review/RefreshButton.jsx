import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function RefreshButton({ repository, number }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [updated, setUpdated] = useState(false);
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function refresh() {
    if (inFlight.current || pending) {
      return;
    }
    inFlight.current = true;
    setRefreshing(true);
    setUpdated(false);
    setError(null);
    try {
      const response = await fetch("/api/refresh", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, number }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The refresh service is unavailable. Please try again.");
      }
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not refresh this PR");
      }
      if (active.current) {
        startTransition(() => router.refresh());
        setUpdated(true);
      }
    } catch (failure) {
      if (active.current) {
        setError(failure.message);
      }
    } finally {
      inFlight.current = false;
      if (active.current) {
        setRefreshing(false);
      }
    }
  }

  const busy = refreshing || pending;
  return <div className="pr-refresh">
    <button className="pr-pin" type="button" title="Sync the latest comments, discussions, reviews, and CI status from GitHub" onClick={refresh} disabled={busy} aria-busy={busy}>
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" /></svg>
      {busy ? "Refreshing…" : "Refresh"}
    </button>
    <span className="pr-refresh-status" role="status">{busy ? "Syncing from GitHub…" : updated ? "Up to date" : ""}</span>
    {error && <span className="pr-refresh-error" role="alert">{error}</span>}
  </div>;
}
