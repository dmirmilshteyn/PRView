import { createContext, useContext, useEffect, useRef, useState } from "react";

const PinContext = createContext(null);

export function usePins() {
  return useContext(PinContext);
}

export default function PinProvider({ pullRequests, children }) {
  const [pins, setPins] = useState(() => new Set(pullRequests.filter((pr) => pr.pinned).map((pr) => pr.number)));
  const [ignored, setIgnored] = useState(() => new Set(pullRequests.filter((pr) => pr.ignored).map((pr) => pr.number)));
  const pendingRequests = useRef(new Set());
  const [pending, setPending] = useState(new Set());
  const [error, setError] = useState(null);
  useEffect(() => {
    setPins(new Set(pullRequests.filter((pr) => pr.pinned).map((pr) => pr.number)));
    setIgnored(new Set(pullRequests.filter((pr) => pr.ignored).map((pr) => pr.number)));
  }, [pullRequests]);

  async function toggleFlag(number, type) {
    const pr = pullRequests.find((item) => item.number === number);
    if (!pr || pendingRequests.current.has(number)) {
      return;
    }
    const values = type === "pin" ? pins : ignored;
    const setValues = type === "pin" ? setPins : setIgnored;
    const value = !values.has(number);
    pendingRequests.current.add(number);
    setPending((current) => new Set([...current, number]));
    setError(null);
    try {
      const response = await fetch("/api/review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: pr.repository, number, operation: { type, value } }), keepalive: true,
      });
      if (!response.ok) {
        throw new Error((await response.json()).error || `Could not save ${type}`);
      }
      setValues((current) => {
        const next = new Set(current);
        if (value) {
          next.add(number);
        } else {
          next.delete(number);
        }
        return next;
      });
    } catch (failure) {
      setError(`Could not ${value ? type : `un${type}`} PR #${number}: ${failure.message}. Try again.`);
    } finally {
      pendingRequests.current.delete(number);
      setPending((current) => {
        const next = new Set(current);
        next.delete(number);
        return next;
      });
    }
  }

  return <PinContext.Provider value={{ pins, ignored, pending, toggle: (number) => toggleFlag(number, "pin"), toggleIgnored: (number) => toggleFlag(number, "ignore"), available: new Set(pullRequests.map((pr) => pr.number)) }}>
    {error && <p className="pin-error" role="alert">{error}</p>}
    {children}
  </PinContext.Provider>;
}
