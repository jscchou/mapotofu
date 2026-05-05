// Render an ISO timestamp as a relative phrase for recent times,
// falling back to an absolute date once the gap is over a week.
//
//   < 30s     → "just now"
//   < 60s     → "N seconds ago"
//   < 60min   → "N minutes ago"
//   < 24h     → "N hours ago"
//   < 48h     → "yesterday"
//   < 7d      → "N days ago"
//   ≥ 7d      → "May 4, 2026, 3:42 PM"

export function formatRelativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (hours < 48) return "yesterday";
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} days ago`;
  return new Date(t).toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
