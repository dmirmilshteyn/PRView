import { createContext, useContext } from "react";
import { useReview } from "./useReview.js";

const ReviewContext = createContext(null);

export function useLocalReview() {
  return useContext(ReviewContext);
}

export default function ReviewProvider({ repository, number, nextPR, children }) {
  const review = useReview(repository, number);
  return <ReviewContext.Provider value={{ ...review, nextPR }}>{children}</ReviewContext.Provider>;
}
