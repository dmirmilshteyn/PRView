import { useEffect, useState } from "react";
import { createReviewStorageKey } from "./review-model";

function readReviewState(storageKey) {
  try {
    const savedState = window.localStorage.getItem(storageKey);

    if (savedState) {
      return JSON.parse(savedState);
    }
  } catch {
    return { collapsedFiles: {}, reviewedFiles: {} };
  }

  return { collapsedFiles: {}, reviewedFiles: {} };
}

export function useReviewState(pullRequestNumber) {
  const storageKey = createReviewStorageKey(pullRequestNumber);
  const [reviewState, setReviewState] = useState(() => readReviewState(storageKey));

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(reviewState));
  }, [reviewState, storageKey]);

  function setFileReviewed(path, reviewed) {
    setReviewState((current) => ({
      collapsedFiles: { ...current.collapsedFiles, [path]: reviewed },
      reviewedFiles: { ...current.reviewedFiles, [path]: reviewed },
    }));
  }

  function toggleFileCollapsed(path) {
    setReviewState((current) => ({
      ...current,
      collapsedFiles: {
        ...current.collapsedFiles,
        [path]: !current.collapsedFiles[path],
      },
    }));
  }

  function resetReview() {
    setReviewState({ collapsedFiles: {}, reviewedFiles: {} });
  }

  return {
    ...reviewState,
    resetReview,
    setFileReviewed,
    toggleFileCollapsed,
  };
}
