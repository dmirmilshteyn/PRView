import { calculateReviewProgress } from "./review-model";

export default function ReviewProgress({ files, onReset, reviewedFiles }) {
  const progress = calculateReviewProgress(files, reviewedFiles);

  return (
    <div className="review-progress">
      <div className="review-progress-copy">
        <strong>{progress.reviewed} of {progress.total} files reviewed</strong>
        <span>{progress.percentage}% complete</span>
      </div>
      <div
        aria-label={`${progress.percentage}% of files reviewed`}
        aria-valuemax="100"
        aria-valuemin="0"
        aria-valuenow={progress.percentage}
        className="review-progress-track"
        role="progressbar"
      >
        <span style={{ width: `${progress.percentage}%` }} />
      </div>
      <button disabled={progress.reviewed === 0} onClick={onReset} type="button">
        Reset review
      </button>
    </div>
  );
}
