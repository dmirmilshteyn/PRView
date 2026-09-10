import { useEffect, useState } from "react";
import { summarizeChecks } from "./ci-status.js";

export default function usePRStatus(details) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (!details) {
      return;
    }
    const controller = new AbortController();
    let timer;
    let busy = false;
    let nextAt = 0;
    let failures = 0;
    async function poll() {
      clearTimeout(timer);
      if (controller.signal.aborted || document.hidden || !navigator.onLine || busy) {
        return;
      }
      if (Date.now() < nextAt) {
        timer = setTimeout(poll, nextAt - Date.now());
        return;
      }
      busy = true;
      let delay = 60000;
      try {
        const response = await fetch(`/api/pr-status?${new URLSearchParams({ repository: details.repository, number: details.number })}`, { signal: controller.signal, cache: "no-store" });
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("Live PR status is unavailable");
        }
        const result = await response.json();
        delay = Math.max(60000, result.pollAfterMs || 60000);
        if (!response.ok) {
          throw new Error(result.error);
        }
        if (!controller.signal.aborted) {
          setLive({ source: details, value: result, error: result.warning });
        }
        failures = 0;
      } catch (error) {
        if (!controller.signal.aborted) {
          failures += 1;
          delay = Math.max(delay, Math.min(900000, 60000 * 2 ** (failures - 1)));
          setLive((previous) => ({ source: details, value: previous?.source === details ? previous.value : null, error: error.message }));
        }
      } finally {
        busy = false;
        nextAt = Date.now() + delay;
        if (!controller.signal.aborted && !document.hidden && navigator.onLine) {
          timer = setTimeout(poll, delay);
        }
      }
    }
    poll();
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("online", poll);
    window.addEventListener("offline", poll);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("online", poll);
      window.removeEventListener("offline", poll);
    };
  }, [details]);
  if (live?.source !== details || !live?.value) {
    return { details, error: live?.source === details ? live.error : null };
  }
  return { details: { ...details, ...live.value, checks: summarizeChecks(live.value.checkRuns) }, error: live.error };
}
