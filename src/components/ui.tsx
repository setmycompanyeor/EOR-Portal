import Link from "next/link";
import type { ReactNode } from "react";

export type Tone = "green" | "amber" | "blue" | "gray" | "red" | "purple";

const toneClass: Record<Tone, string> = {
  green: "bg-green-soft text-green-ink",
  amber: "bg-amber-soft text-amber-ink",
  blue: "bg-brand-soft text-brand-ink",
  gray: "bg-gray-soft text-gray-ink",
  red: "bg-red-soft text-red-ink",
  purple: "bg-purple-soft text-purple-ink",
};

export function Badge({ tone = "gray", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold">{title}</h1>
        {subtitle && <div className="text-[13px] text-ink-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "amber" | "red" }) {
  const color = tone === "amber" ? "text-amber-ink" : tone === "red" ? "text-red-ink" : "";
  return (
    <div className="card flex flex-col gap-1.5">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className={`text-[26px] font-semibold tracking-tight ${color}`}>{value}</span>
      {hint && <span className="text-[13px] text-ink-muted">{hint}</span>}
    </div>
  );
}

export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center justify-between gap-3 border-b border-line-soft py-3 last:border-b-0 ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">{children}</div>;
}

export function LinkButton({ href, children, primary, small, className = "" }: { href: string; children: ReactNode; primary?: boolean; small?: boolean; className?: string }) {
  return (
    <Link href={href} className={`btn ${primary ? "btn-primary" : ""} ${small ? "btn-sm" : ""} ${className}`}>
      {children}
    </Link>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="th">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">{children}</tbody>
      </table>
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-ink">
      {initials || "?"}
    </span>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="h-4 w-1/3 rounded bg-gray-soft" />
          <div className="mt-3 h-3 w-2/3 rounded bg-gray-soft" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-soft" />
        </div>
      ))}
    </div>
  );
}
