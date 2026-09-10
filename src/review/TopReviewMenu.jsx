import { useState } from "react";
import { useLocalReview } from "./ReviewProvider.jsx";
import FinalReview from "./FinalReview.jsx";
import Modal from "./Modal.jsx";

export default function TopReviewMenu({ details, files }) {
  const { state, ready } = useLocalReview();
  const [open, setOpen] = useState(false);
  const reviewedCount = files.filter((file) => state.reviewed[file.path]?.fingerprint === file.fingerprint).length;
  return <>
    <button className="top-review-button" type="button" disabled={!ready} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2h10v9H8l-4 3v-3H3V2Z" /><path d="m5.5 6 1.5 1.5 3-3" /></svg>
      Review
    </button>
    {open && <Modal title="Finish review" onClose={() => setOpen(false)}><FinalReview revision={details.revision} currentRevision={details.revision} reviewedCount={reviewedCount} fileCount={files.length} /></Modal>}
  </>;
}
