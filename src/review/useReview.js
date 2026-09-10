import { useEffect, useRef, useState } from "react";
import { applyOperation, emptyReview } from "./state.js";

export function useReview(repository, number) {
  const [state, setState] = useState(emptyReview);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading review…");
  const [error, setError] = useState(null);
  const queue = useRef([]);
  const saving = useRef(false);

  async function load() {
    try {
      const response = await fetch(`/api/review?repository=${encodeURIComponent(repository)}&pr=${number}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error((await response.json()).error);
      }
      setState(await response.json());
      setReady(true);
      setError(null);
      setStatus("Saved");
    } catch (failure) {
      setError(failure.message);
    }
  }

  useEffect(() => { load(); }, [repository, number]);

  useEffect(() => {
    function protectPendingSaves(event) {
      if (queue.current.length) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", protectPendingSaves);
    return () => window.removeEventListener("beforeunload", protectPendingSaves);
  }, []);

  async function flush() {
    if (saving.current) {
      return;
    }
    saving.current = true;
    setError(null);
    setStatus("Saving…");
    try {
      while (queue.current.length) {
        const operation = queue.current[0];
        const response = await fetch("/api/review", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repository, number, operation }), keepalive: true,
        });
        const result = await response.json();
        if (!response.ok) {
          if (result.state) {
            setState(queue.current.reduce(applyOperation, result.state));
          }
          throw new Error(result.error);
        }
        queue.current.shift();
        setState(queue.current.reduce(applyOperation, result));
      }
      setStatus("Saved");
    } catch (failure) {
      setStatus("Not saved");
      setError(failure.message);
    } finally {
      saving.current = false;
    }
  }

  function update(operation) {
    if (operation.type === "cancelReview") {
      // An explicitly abandoned submission must not run ahead of its cancellation on retry.
      queue.current = queue.current.filter((item) => !(item.type === "finalReview" && item.review.id === operation.id));
    }
    setState((current) => applyOperation(current, operation));
    // Coalesce typing/scroll events while a previous operation is being saved.
    const last = queue.current.at(-1);
    if (queue.current.length > 1 && ["draft", "reviewDraft", "position"].includes(operation.type) && last.type === operation.type && last.filePath === operation.filePath && last.revision === operation.revision) {
      queue.current[queue.current.length - 1] = operation;
    } else {
      queue.current.push(operation);
    }
    flush();
  }

  return { state, ready, status, error, update, retry: ready ? flush : load };
}
