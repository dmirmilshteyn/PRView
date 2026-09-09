import { createContext, useContext, useEffect, useState } from "react";

const PinContext = createContext(null);

export function usePins() {
  return useContext(PinContext);
}

export default function PinProvider({ pullRequests, children }) {
  const [pins, setPins] = useState(() => new Set(pullRequests.filter((pr) => pr.pinned).map((pr) => pr.number)));
  const [pending, setPending] = useState(new Set());
  const [error, setError] = useState(null);
  useEffect(() => {
    setPins(new Set(pullRequests.filter((pr) => pr.pinned).map((pr) => pr.number)));
  }, [pullRequests]);

  async function toggle(number) {
    const pr = pullRequests.find((item) => item.number === number);
    if (!pr || pending.has(number)) {
      return;
    }
    const value = !pins.has(number);
    setPending((current) => new Set([...current, number]));
    setError(null);
    try {
      const response = await fetch("/api/review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: pr.repository, number, operation: { type: "pin", value } }), keepalive: true,
      });
      if (!response.ok) {
        throw new Error((await response.json()).error || "Could not save pin");
      }
      setPins((current) => {
        const next = new Set(current);
        if (value) {
          next.add(number);
        } else {
          next.delete(number);
        }
        return next;
      });
    } catch (failure) {
      setError(`Could not ${value ? "pin" : "unpin"} PR #${number}: ${failure.message}. Try again.`);
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(number);
        return next;
      });
    }
  }

  return <PinContext.Provider value={{ pins, pending, toggle, available: new Set(pullRequests.map((pr) => pr.number)) }}>
    {error && <p className="pin-error" role="alert">{error}</p>}
    {children}
  </PinContext.Provider>;
}
