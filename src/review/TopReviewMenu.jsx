import { useState } from "react";
import { useLocalReview } from "./ReviewProvider.jsx";
import FinalReview from "./FinalReview.jsx";
import Modal from "./Modal.jsx";

export default function TopReviewMenu({ details, files }) {
  const { state, ready, update } = useLocalReview();
  const [open, setOpen] = useState(false);
  const reviewedCount = files.filter((file) => state.reviewed[file.path]?.fingerprint === file.fingerprint).length;
  return <>
    <label className="top-review-menu"><span className="stack-sr-only">Finish review</span><select aria-label="Finish review" value="" disabled={!ready} onChange={(event) => {
      const draft = state.reviewDrafts?.[details.revision] ?? { body: "" };
      update({ type: "reviewDraft", revision: details.revision, draft: { ...draft, event: event.target.value } });
      setOpen(true);
    }}><option value="" disabled>Review…</option><option value="COMMENT">Comment</option><option value="REQUEST_CHANGES">Request changes</option><option value="APPROVE">Approve</option></select></label>
    {open && <Modal title="Finish review" onClose={() => setOpen(false)}><FinalReview revision={details.revision} currentRevision={details.revision} reviewedCount={reviewedCount} fileCount={files.length} /></Modal>}
  </>;
}
