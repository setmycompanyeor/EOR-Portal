"use client";

import { useTransition } from "react";
import { titleCase } from "@/lib/format";

export type SelectOption = string | { value: string; label: string };

/** A select that calls a bound server action with the chosen value. */
export function ActionSelect({ action, value, options, label }: { action: (value: string) => Promise<void>; value: string; options: SelectOption[]; label: string }) {
  const [pending, start] = useTransition();
  return (
    <select aria-label={label} className="input min-h-[34px] w-auto max-w-[180px] py-1 text-[13px]" value={value} disabled={pending} onChange={(e) => start(() => action(e.target.value))}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? titleCase(o) : o.label;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

/** A button that calls a bound server action. */
export function ActionButton({ action, children, primary, danger, small = true }: { action: () => Promise<void>; children: React.ReactNode; primary?: boolean; danger?: boolean; small?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={`btn ${small ? "btn-sm" : ""} ${primary ? "btn-primary" : ""} ${danger ? "btn-danger" : ""}`} disabled={pending} onClick={() => start(() => action())}>
      {pending ? "…" : children}
    </button>
  );
}

/** Opens a signed URL returned by a bound server action in a new tab. */
export function OpenFileButton({ action, children }: { action: () => Promise<string | null>; children: React.ReactNode }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const url = await action();
          if (url) window.open(url, "_blank", "noopener");
        })
      }
    >
      {pending ? "…" : children}
    </button>
  );
}
