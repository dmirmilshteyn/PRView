import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown.jsx";
import CommentTime from "./CommentTime.jsx";
import TourCode from "./TourCode.jsx";
import { nextUnreviewedIndex, ignoresReviewShortcut } from "./review-navigation.js";

function TourList({ items, empty }) {
  return items.length ? <ul>{items.map((item, index) => <li key={index}><Markdown>{item}</Markdown></li>)}</ul> : <p className="review-muted">{empty}</p>;
}

function TourReviewed({ section, title, reviewed, pending, onChange }) {
  return <label className="tour-reviewed" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <input type="checkbox" aria-label={`Reviewed: ${title}`} checked={reviewed} disabled={pending} onChange={(event) => onChange(section, event.target.checked)} />
    {pending ? "Saving…" : "Reviewed"}
  </label>;
}

function TourStop({ stop, onOpenCode, revision }) {
  return <>
          <div className={`tour-callout ${stop.risk}`}><h4>Why this matters · {stop.risk} focus</h4><Markdown>{stop.why}</Markdown></div>
          <Markdown>{stop.explanation}</Markdown>
          {stop.references.map((reference, index) => <div className="tour-code" key={index}>
            <header><span>{reference.path} · {reference.side === "LEFT" ? "Before" : "After"} · L{reference.start}{reference.end !== reference.start ? `–${reference.end}` : ""}</span><button type="button" onClick={() => onOpenCode(reference)}>Open in Code</button></header>
            <TourCode reference={reference} revision={revision} />
          </div>)}
          <div className="tour-questions"><h4>Review checkpoints</h4><TourList items={stop.questions} empty="" /></div>
  </>;
}

export default function ReviewTour({ details, fileCount, active, onOpenCode }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(new Set());
  const [saveError, setSaveError] = useState(null);
  const pendingSections = useRef(new Set());
  const loadVersion = useRef(0);
  const sectionElements = useRef([]);
  const sidebar = useRef(null);
  const content = useRef(null);
  const currentSection = useRef(0);
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
        const version = loadVersion.current;
        const value = fingerprint
          ? await request(`/api/tour?${new URLSearchParams({ repository: details.repository, pr: String(details.number), fingerprint })}`, { cache: "no-store" })
          : await request("/api/tour", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository: details.repository, number: details.number, revision: details.revision, baseSha: details.baseSha, retry: attempt > 0 }) });
        if (controller.signal.aborted) {
          return;
        }
        const key = fingerprint ?? value.fingerprint;
        if (version === loadVersion.current) {
          setState({ ...value, fingerprint: key });
        }
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
    if (!active || error || state?.status !== "ready") {
      return;
    }
    let frame;
    const storageKey = `prview-tour-stop:${state.fingerprint}`;
    if (!restored.current) {
      restored.current = true;
      try {
        const saved = Number(localStorage.getItem(storageKey));
        if (Number.isInteger(saved) && saved >= 0 && saved < sectionElements.current.length) {
          currentSection.current = saved;
        }
      } catch {}
    }
    function trackSection() {
      frame = null;
      if (!sidebar.current || !content.current) {
        return;
      }
      const elements = sectionElements.current;
      const sidebarRect = sidebar.current.getBoundingClientRect();
      const contentRect = content.current.getBoundingClientRect();
      const stacked = Math.abs(sidebarRect.left - contentRect.left) < 2;
      const readingLine = stacked ? Math.max(100, sidebarRect.bottom + 24) : 100;
      let index = 0;
      for (let candidate = 0; candidate < elements.length; candidate += 1) {
        if (elements[candidate]?.getBoundingClientRect().top <= readingLine + 1) {
          index = candidate;
        }
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        index = elements.length - 1;
      }
      if (currentSection.current !== index) {
        currentSection.current = index;
        try {
          localStorage.setItem(storageKey, String(index));
        } catch {}
      }
      setSelected(index);
    }
    function schedule() {
      if (frame == null) {
        frame = requestAnimationFrame(trackSection);
      }
    }
    frame = requestAnimationFrame(() => {
      sectionElements.current[currentSection.current]?.scrollIntoView({ block: "start" });
      trackSection();
    });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(content.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [active, error, state?.status, state?.fingerprint]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const button = sidebar.current?.querySelector('[aria-current="location"]');
    if (button) {
      const parent = sidebar.current.getBoundingClientRect();
      const child = button.getBoundingClientRect();
      if (child.top < parent.top || child.bottom > parent.bottom) {
        sidebar.current.scrollTop += child.top - parent.top - 45;
      }
    }
  }, [selected, active]);

  function navigate(index) {
    currentSection.current = index;
    setSelected(index);
    try {
      localStorage.setItem(`prview-tour-stop:${state.fingerprint}`, String(index));
    } catch {}
    const section = sectionElements.current[index];
    if (section) {
      section.open = true;
    }
    section?.querySelector("summary")?.focus({ preventScroll: true });
    section?.scrollIntoView({ block: "start" });
  }
  async function markReviewed(section, reviewed, advance) {
    if (!state?.fingerprint || pendingSections.current.has(section)) {
      return;
    }
    const fingerprint = state.fingerprint;
    pendingSections.current.add(section);
    loadVersion.current += 1;
    setSaving(new Set(pendingSections.current));
    setSaveError(null);
    try {
      const response = await fetch("/api/tour", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ repository: details.repository, number: details.number, fingerprint, section, reviewed }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The tour service is unavailable");
      }
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not save review progress");
      }
      if (reviewed && result.reviewedSections[section]) {
        const element = sectionElements.current[sectionKeys.indexOf(section)];
        if (element) {
          const hadFocus = element.contains(document.activeElement);
          element.open = false;
          if (hadFocus) {
            element.querySelector("summary")?.focus();
          }
        }
      }
      setState((current) => {
        if (current?.fingerprint !== fingerprint) {
          return current;
        }
        const reviewedSections = { ...current.reviewedSections };
        if (result.reviewedSections[section]) {
          reviewedSections[section] = result.reviewedSections[section];
        } else {
          delete reviewedSections[section];
        }
        return { ...current, reviewedSections };
      });
      if (advance) {
        const next = nextUnreviewedIndex(sectionKeys, sectionKeys.indexOf(section), new Set(Object.keys(result.reviewedSections).filter((key) => result.reviewedSections[key])));
        if (next !== null) {
          requestAnimationFrame(() => navigate(next));
        }
      }
    } catch (failure) {
      setSaveError(`Could not save section progress: ${failure.message}. Try the checkbox again.`);
    } finally {
      loadVersion.current += 1;
      pendingSections.current.delete(section);
      setSaving(new Set(pendingSections.current));
    }
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (!active || state?.status !== "ready" || ignoresReviewShortcut(event) || document.querySelector("dialog[open]") || event.key.toLowerCase() !== "m") {
        return;
      }
      event.preventDefault();
      markReviewed(sectionKeys[selected], true, true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
  const mechanical = tour.mechanical ?? [];
  const mechanicalIndex = mechanical.length ? tour.steps.length + 1 : -1;
  const sections = ["Overview", ...tour.steps.map((step) => step.title.replace(/^\d+[.)]\s*/, "")), ...(mechanical.length ? ["Mechanical changes"] : []), "Tests & coverage"];
  const sectionKeys = ["overview", ...tour.steps.map((step) => `step-${step.id}`), ...(mechanical.length ? ["mechanical"] : []), "tests"];
  const reviewedSections = state.reviewedSections ?? {};
  const reviewedCount = sectionKeys.filter((key) => reviewedSections[key]).length;
  function reviewedControl(index) {
    const section = sectionKeys[index];
    return <footer className="tour-section-footer"><TourReviewed section={section} title={sections[index]} reviewed={Boolean(reviewedSections[section])} pending={saving.has(section)} onChange={(key, value) => markReviewed(key, value, false)} /><button type="button" disabled={saving.has(section)} title="Mark reviewed and advance (M)" onClick={() => markReviewed(section, true, true)}>Reviewed & next <kbd>M</kbd></button></footer>;
  }
  function reviewedIndicator(index) {
    return reviewedSections[sectionKeys[index]] ? <span className="tour-reviewed-indicator">✓ Reviewed</span> : null;
  }
  return <section className="review-workspace tour-workspace" aria-label="PR review tour">
    <div className="tour-meta"><span>Luna · snapshot {state.revision?.slice(0, 8)}</span><span>Generated <CommentTime value={state.generatedAt} /></span><span>{tour.coveredCount}/{tour.fileCount} files in the route · {tour.steps.length} review stops{mechanical.length ? ` · ${mechanical.length} mechanical groups` : ""}</span></div>
    <div className="tour-review-progress"><strong>{reviewedCount} / {sections.length} sections reviewed</strong><span role="status">{saving.size ? "Saving…" : saveError ? "Not saved" : "Saved"}</span></div>
    {saveError && <p className="tour-save-error" role="alert">{saveError}</p>}
    <div className="review-layout">
      <aside className="review-sidebar tour-sidebar" aria-label="Tour sections" ref={sidebar}>
        <strong>Review route</strong>
        {sections.map((title, index) => <button key={index} type="button" className={selected === index ? "active" : ""} aria-current={selected === index ? "location" : undefined} aria-controls={`tour-section-${index}`} onClick={() => navigate(index)}>
          <span className={`tour-stop-number ${reviewedSections[sectionKeys[index]] ? "is-reviewed" : ""}`}><span aria-label={reviewedSections[sectionKeys[index]] ? "Reviewed" : undefined}>{reviewedSections[sectionKeys[index]] ? "✓" : index === 0 ? "◉" : index === sections.length - 1 ? "◎" : index === mechanicalIndex ? "◇" : index}</span></span>
          <span>{title}{tour.steps[index - 1] && <small className={`tour-risk ${tour.steps[index - 1].risk}`}>{tour.steps[index - 1].risk} focus</small>}</span>
        </button>)}
      </aside>
      <div className="tour-content" ref={content}>
        <details open={!reviewedSections[sectionKeys[0]]} className="tour-section" id="tour-section-0" aria-labelledby="tour-heading-0" ref={(element) => { sectionElements.current[0] = element; }}>
          <summary className="tour-section-heading"><p className="eyebrow">The review plan</p><h3 id="tour-heading-0" tabIndex={-1}>{tour.title}</h3>{reviewedIndicator(0)}</summary>
          <Markdown>{tour.overview}</Markdown>
          <div className="tour-callout"><h4>Follow the change</h4><Markdown>{tour.flow}</Markdown></div>
          <p className="review-muted">Follow the route in order or jump to a section. These are review checkpoints, not verified findings.</p>
          {reviewedControl(0)}
        </details>
        {tour.steps.map((stop, stopIndex) => <details open={!reviewedSections[sectionKeys[stopIndex + 1]]} className="tour-section" id={`tour-section-${stopIndex + 1}`} aria-labelledby={`tour-heading-${stopIndex + 1}`} key={stop.id} ref={(element) => { sectionElements.current[stopIndex + 1] = element; }}>
          <summary className="tour-section-heading"><p className="eyebrow">Stop {stopIndex + 1} of {tour.steps.length}</p><h3 id={`tour-heading-${stopIndex + 1}`} tabIndex={-1}>{sections[stopIndex + 1]}</h3>{reviewedIndicator(stopIndex + 1)}</summary>
          <TourStop stop={stop} onOpenCode={onOpenCode} revision={details.revision} />
          {reviewedControl(stopIndex + 1)}
        </details>)}
        {mechanical.length > 0 && <details className="tour-section tour-mechanical" id={`tour-section-${mechanicalIndex}`} aria-labelledby="tour-mechanical-heading" ref={(element) => { sectionElements.current[mechanicalIndex] = element; }}>
          <summary className="tour-section-heading"><p className="eyebrow">Supporting work · {mechanical.length} groups</p><h3 id="tour-mechanical-heading">Mechanical changes</h3>{reviewedIndicator(mechanicalIndex)}</summary>
          <p className="review-muted">Prop plumbing, repetitive wiring, and other behavior-preserving edits. Expand the code references for a quick consistency review.</p>
          {mechanical.map((stop) => <div className="tour-mechanical-group" key={stop.id}><h4>{stop.title.replace(/^\d+[.)]\s*/, "")}</h4><TourStop stop={stop} onOpenCode={onOpenCode} revision={details.revision} /></div>)}
          {reviewedControl(mechanicalIndex)}
        </details>}
        <details open={!reviewedSections[sectionKeys[sections.length - 1]]} className="tour-section" id={`tour-section-${sections.length - 1}`} aria-labelledby="tour-tests-heading" ref={(element) => { sectionElements.current[sections.length - 1] = element; }}>
          <summary className="tour-section-heading"><p className="eyebrow">Before you finish</p><h3 id="tour-tests-heading" tabIndex={-1}>Tests & coverage</h3>{reviewedIndicator(sections.length - 1)}</summary>
          <h4>Tests found in the change</h4><TourList items={tour.existingTests} empty="No existing test coverage was identified in the supplied snapshot." />
          <h4>What to verify</h4><TourList items={tour.suggestedTests} empty="No additional test scenarios were suggested." />
          <h4>Outside the guided route</h4>{tour.notCovered.length ? <ul>{tour.notCovered.map((file) => <li key={file.path}><strong>{file.path}</strong><Markdown>{file.reason}</Markdown></li>)}</ul> : <p>Every changed file is referenced by a tour stop.</p>}
          <h4>Evidence & limitations</h4><TourList items={tour.limitations} empty="Luna reported no additional limitations." /><p className="review-muted">This tour explains the supplied snapshot. It does not run tests or mark files reviewed.</p>
          {reviewedControl(sections.length - 1)}
        </details>
      </div>
    </div>
  </section>;
}
