import { createContext, useContext } from "react";
import { useReview } from "./useReview.js";

const ReviewContext = createContext(null);

export function useLocalReview() {
  return useContext(ReviewContext);
}

export default function ReviewProvider({ repository, number, children }) {
  const review = useReview(repository, number);
  return <ReviewContext.Provider value={review}>{children}</ReviewContext.Provider>;
}
