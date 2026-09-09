import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown.jsx";
import CommentTime from "./CommentTime.jsx";

function TourList({ items, empty }) {
  return items.length ? <ul>{items.map((item, index) => <li key={index}><Markdown>{item}</Markdown></li>)}</ul> : <p className="review-muted">{empty}</p>;
}

export default function ReviewTour({ details, fileCount, active, onOpenCode }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(0);
  const heading = useRef(null);
  const restored = useRef(false);
  useEffect(() => {
    if (!active) {
      return;
    }
    const controller = new AbortController();
    let timer;
    async function request(url, options) {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The tour service is unavailable. Please try again.");
      }
      const value = await response.json();
      if (!response.ok) {
        throw new Error(value.error || "Could not load the tour");
      }
      return value;
    }
    async function load(fingerprint) {
      try {
        const value = fingerprint
          ? await request(`/api/tour?${new URLSearchParams({ repository: details.repository, pr: String(details.number), fingerprint })}`, { cache: "no-store" })
          : await request("/api/tour", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository: details.repository, number: details.number, revision: details.revision, baseSha: details.baseSha, retry: attempt > 0 }) });
        if (controller.signal.aborted) {
          return;
        }
        const key = fingerprint ?? value.fingerprint;
        setState({ ...value, fingerprint: key });
        setError(null);
        if (value.status === "running") {
          timer = setTimeout(() => load(key), 1500);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure.message);
        }
      }
    }
    void load(null);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [active, attempt, details.repository, details.number, details.revision, details.baseSha]);

  useEffect(() => {
    if (state?.status === "ready" && !restored.current) {
      restored.current = true;
      try {
        const saved = Number(localStorage.getItem(`prview-tour-stop:${state.fingerprint}`));
        if (Number.isInteger(saved) && saved >= 0 && saved <= state.tour.steps.length + 1) {
          setSelected(saved);
        }
      } catch {}
    }
  }, [state]);

  function navigate(index) {
    setSelected(index);
    try {
      localStorage.setItem(`prview-tour-stop:${state.fingerprint}`, String(index));
    } catch {}
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start" });
    });
  }
  function retry() {
    setState(null);
    setError(null);
    setAttempt((value) => value + 1);
  }
  if (error || state?.status === "error") {
    return <div className="tour-loading"><h3>Tour couldn’t be generated</h3><p role="alert">{error || state.error}</p><button type="button" onClick={retry}>Retry tour</button></div>;
  }
  if (state?.status === "empty" || fileCount === 0) {
    return <div className="tour-loading"><h3>No changed files to tour</h3><p>Refresh this PR if you expect code changes.</p></div>;
  }
  if (!state || state.status !== "ready") {
    return <div className="tour-loading" aria-busy="true">
      <span className="tour-spinner" aria-hidden="true" />
      <h3>Building your review tour</h3>
      <p role="status">{state?.activity || "Looking for a saved tour…"}</p>
      <p className="review-muted">Luna maps {fileCount} changed files into a review route, with code references, risk checkpoints, and test ideas. Larger PRs can take a few minutes.</p>
      <p className="review-muted">You can return to Code while it runs. The completed tour will be saved for this snapshot.</p>
    </div>;
  }
  const tour = state.tour;
  const sections = ["Overview", ...tour.steps.map((step) => step.title.replace(/^\d+[.)]\s*/, "")), "Tests & coverage"];
  const stop = tour.steps[selected - 1];
  return <section className="review-workspace tour-workspace" aria-label="PR review tour">
    <div className="tour-meta"><span>Luna · snapshot {state.revision?.slice(0, 8)}</span><span>Generated <CommentTime value={state.generatedAt} /></span><span>{tour.coveredCount}/{tour.fileCount} files in the route · {tour.steps.length} stops</span></div>
    <div className="review-layout">
      <aside className="review-sidebar tour-sidebar" aria-label="Tour sections">
        <strong>Review route</strong>
        {sections.map((title, index) => <button key={index} type="button" className={selected === index ? "active" : ""} aria-current={selected === index ? "step" : undefined} onClick={() => navigate(index)}>
          <span className="tour-stop-number">{index === 0 ? "◉" : index === sections.length - 1 ? "✓" : index}</span>
          <span>{title}{tour.steps[index - 1] && <small className={`tour-risk ${tour.steps[index - 1].risk}`}>{tour.steps[index - 1].risk} focus</small>}</span>
        </button>)}
      </aside>
      <div className="tour-content">
        <header className="tour-section-heading" ref={heading} tabIndex={-1}><p className="eyebrow">{stop ? `Stop ${selected} of ${tour.steps.length}` : selected === 0 ? "The review plan" : "Before you finish"}</p><h3>{selected === 0 ? tour.title : sections[selected]}</h3></header>
        {selected === 0 ? <>
          <Markdown>{tour.overview}</Markdown>
          <div className="tour-callout"><h4>Follow the change</h4><Markdown>{tour.flow}</Markdown></div>
          <p className="review-muted">Follow the route in order or jump to a section. These are review checkpoints, not verified findings.</p>
        </> : stop ? <>
          <div className={`tour-callout ${stop.risk}`}><h4>Why this matters · {stop.risk} focus</h4><Markdown>{stop.why}</Markdown></div>
          <Markdown>{stop.explanation}</Markdown>
          {stop.references.map((reference, index) => <div className="tour-code" key={index}>
            <header><span>{reference.path} · {reference.side === "LEFT" ? "Before" : "After"} · L{reference.start}{reference.end !== reference.start ? `–${reference.end}` : ""}</span><button type="button" onClick={() => onOpenCode(reference)}>Open in Code</button></header>
            <pre aria-label={`${reference.path} lines ${reference.start} to ${reference.end}`}><code>{reference.excerpt.split("\n").map((line, offset) => <span className="tour-code-line" key={offset}><span aria-hidden="true">{reference.start + offset}</span>{line}{"\n"}</span>)}</code></pre>
          </div>)}
          <div className="tour-questions"><h4>Review checkpoints</h4><TourList items={stop.questions} empty="" /></div>
        </> : <>
          <h4>Tests found in the change</h4><TourList items={tour.existingTests} empty="No existing test coverage was identified in the supplied snapshot." />
          <h4>What to verify</h4><TourList items={tour.suggestedTests} empty="No additional test scenarios were suggested." />
          <h4>Outside the guided route</h4>{tour.notCovered.length ? <ul>{tour.notCovered.map((file) => <li key={file.path}><strong>{file.path}</strong><Markdown>{file.reason}</Markdown></li>)}</ul> : <p>Every changed file is referenced by a tour stop.</p>}
          <h4>Evidence & limitations</h4><TourList items={tour.limitations} empty="Luna reported no additional limitations." /><p className="review-muted">This tour explains the supplied snapshot. It does not run tests or mark files reviewed.</p>
        </>}
        <nav className="tour-pagination" aria-label="Tour navigation"><button type="button" disabled={selected === 0} onClick={() => navigate(selected - 1)}>← Previous</button><span>{selected + 1} / {sections.length}</span><button type="button" disabled={selected === sections.length - 1} onClick={() => navigate(selected + 1)}>{selected === 0 ? "Start review →" : "Next →"}</button></nav>
      </div>
    </div>
  </section>;
}
