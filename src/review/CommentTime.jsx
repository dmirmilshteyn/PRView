"use client";

import { useEffect, useState } from "react";
import { friendlyCommentTime } from "./comment-time.js";

export default function CommentTime({ value }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const time = now ? friendlyCommentTime(value, now, undefined) : null;
  return time ? <time className="comment-time" dateTime={time.iso} title={time.exact} aria-label={time.exact}>{time.label}</time> : null;
}
