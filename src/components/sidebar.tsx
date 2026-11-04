"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

export function Sidebar({
  items,
  brand,
  footer,
  variant = "client",
}: {
  items: NavItem[];
  brand: { title: string; subtitle: string };
  footer?: React.ReactNode;
  variant?: "client" | "ops";
}) {
  const pathname = usePathname();
  const ops = variant === "ops";
  const base = ops ? "bg-ops-navy text-ops-text" : "bg-navy text-navy-text";
  const hover = ops ? "hover:bg-ops-hover" : "hover:bg-navy-hover";
  const active = ops ? "bg-ops text-white" : "bg-brand text-white";
  const logo = ops ? "bg-ops" : "bg-brand";
  const line = ops ? "border-ops-line" : "border-navy-line";

  return (
    <nav aria-label="Primary" className={`flex w-full flex-col gap-1.5 px-3.5 py-5 md:w-[232px] md:shrink-0 ${base}`}>
      <div className="flex items-center gap-2.5 px-3 pb-4">
        <span aria-hidden="true" className={`inline-block h-[30px] w-[30px] rounded-lg ${logo}`} />
        <div>
          <div className="text-[15px] font-semibold text-white">{brand.title}</div>
          <div className="text-xs opacity-70">{brand.subtitle}</div>
        </div>
      </div>
      <div className="flex flex-row flex-wrap gap-0.5 md:flex-col">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const on = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${on ? active : `${hover} hover:text-white`}`}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </div>
      {footer && <div className={`mt-auto border-t pt-3 text-[13px] ${line}`}>{footer}</div>}
    </nav>
  );
}
