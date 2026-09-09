export function friendlyCommentTime(value, now, locale) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return null;
  }
  const elapsed = now.getTime() - date.getTime();
  const time = date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  let label;
  if (elapsed >= 0 && elapsed < 60000) {
    label = "Just now";
  } else if (elapsed >= 60000 && elapsed < 3600000) {
    label = new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-Math.floor(elapsed / 60000), "minute");
  } else if (date.toDateString() === now.toDateString()) {
    label = `Today at ${time}`;
  } else {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    label = date.toDateString() === yesterday.toDateString()
      ? `Yesterday at ${time}`
      : `${date.toLocaleDateString(locale, { month: "short", day: "numeric", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) })} at ${time}`;
  }
  return { label, exact: date.toLocaleString(locale, { dateStyle: "full", timeStyle: "long" }), iso: date.toISOString() };
}
