import { useEffect, useState } from "react";
import { hasPendingChecks, summarizeChecks } from "./ci-status.js";

export default function useCIStatus(details) {
  const [live, setLive] = useState(null);

  useEffect(() => {
    if (!details || !hasPendingChecks(details.checkRuns ?? [])) {
      return;
    }
    const controller = new AbortController();
    let timer;
    async function refresh() {
      try {
        const response = await fetch(`/api/ci-status?${new URLSearchParams({ repository: details.repository, number: details.number })}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Could not refresh CI status");
        }
        if (controller.signal.aborted) {
          return;
        }
        setLive({ source: details, checkRuns: result.checkRuns, error: null });
        if (!hasPendingChecks(result.checkRuns)) {
          return;
        }
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setLive((previous) => ({ source: details, checkRuns: previous?.source === details ? previous.checkRuns : details.checkRuns, error: "CI refresh failed. Retrying in one minute." }));
      }
      timer = setTimeout(refresh, 60000);
    }
    timer = setTimeout(refresh, 60000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [details]);

  if (!details || live?.source !== details) {
    return { details, error: null };
  }
  return { details: { ...details, checkRuns: live.checkRuns, checks: summarizeChecks(live.checkRuns) }, error: live.error };
}
