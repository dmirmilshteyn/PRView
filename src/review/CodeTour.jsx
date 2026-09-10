import { useRef, useState } from "react";
import ReviewWorkspace from "./ReviewWorkspace.jsx";
import ReviewTour from "./ReviewTour.jsx";

export default function CodeTour({ details, diff, revisions }) {
  const [tab, setTab] = useState("code");
  const [visited, setVisited] = useState(false);
  const [target, setTarget] = useState(null);
  const tabs = useRef(null);
  function choose(value) {
    setTab(value);
    if (value === "tour") {
      setVisited(true);
    }
  }
  function openCode(reference) {
    setTarget({ ...reference, revision: details.revision });
    setTab("code");
  }
  return <section className="pr-page-section" id="code" aria-label="Code review">
    <div className="code-tour-tabs" role="tablist" aria-label="Review mode" ref={tabs} onKeyDown={(event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? "code" : event.key === "End" ? "tour" : tab === "code" ? "tour" : "code";
        choose(next);
        tabs.current.querySelector(`#${next}-tab`).focus();
      }
    }}>
      {["code", "tour"].map((value) => <button key={value} id={`${value}-tab`} role="tab" type="button" aria-selected={tab === value} aria-controls={`${value}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => choose(value)}>{value === "code" ? "Code" : "Tour"}</button>)}
    </div>
    <div id="code-panel" role="tabpanel" aria-labelledby="code-tab" hidden={tab !== "code"}>
      <ReviewWorkspace details={details} diff={diff} revisions={revisions} active={tab === "code"} navigationTarget={target} />
    </div>
    <div id="tour-panel" role="tabpanel" aria-labelledby="tour-tab" hidden={tab !== "tour"}>
      {visited && <ReviewTour key={`${details.revision}:${details.baseSha}:${details.diffBaseSha}`} details={details} diff={diff} fileCount={diff.files.length} active={tab === "tour"} onOpenCode={openCode} />}
    </div>
  </section>;
}
