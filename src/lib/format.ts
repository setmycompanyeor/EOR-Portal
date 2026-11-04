export function inr(amount: number | string | null | undefined, opts: { compact?: boolean } = {}) {
  const n = Number(amount ?? 0);
  if (opts.compact && Math.abs(n) >= 100000) {
    return `₹${(n / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
  }
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function formatDate(value: string | Date | null | undefined, opts: { withTime?: boolean } = {}) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (!opts.withTime) return date;
  return `${date}, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export function relativeDue(due: string | null | undefined, today = new Date()) {
  if (!due) return { label: "No due date", tone: "gray" as const };
  const d = new Date(due);
  const days = Math.round((d.getTime() - new Date(today.toDateString()).getTime()) / 86400000);
  if (days < 0) return { label: days === -1 ? "Yesterday" : `${-days} days overdue`, tone: "red" as const };
  if (days === 0) return { label: "Today", tone: "amber" as const };
  if (days === 1) return { label: "Tomorrow", tone: "amber" as const };
  if (days <= 7) return { label: `In ${days} days`, tone: "amber" as const };
  return { label: formatDate(due), tone: "gray" as const };
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
