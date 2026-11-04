"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Home, ClipboardList, Users, Calculator, Wallet, Inbox, Truck, Settings, ListChecks, Building2, FileText, Settings2 } from "lucide-react";
import { Sidebar, type NavItem } from "@/components/sidebar";

// Icons are React components, so the nav definitions live in a client module
// (server components can't pass component references to client components).

const clientItems: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: Home, exact: true },
  { href: "/app/onboarding", label: "Onboarding", icon: ClipboardList },
  { href: "/app/employees", label: "Employees", icon: Users },
  { href: "/app/estimator", label: "Invoice estimator", icon: Calculator },
  { href: "/app/billing", label: "Deposit & billing", icon: Wallet },
  { href: "/app/requests", label: "Requests", icon: Inbox },
  { href: "/app/tracking", label: "Tracking", icon: Truck },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

const opsItems: NavItem[] = [
  { href: "/ops", label: "Work queue", icon: ListChecks, exact: true },
  { href: "/ops/clients", label: "Clients", icon: Building2 },
  { href: "/ops/employees", label: "Employees", icon: Users },
  { href: "/ops/billing", label: "Invoices & deposits", icon: Wallet },
  { href: "/ops/requests", label: "Quotes & requests", icon: FileText },
  { href: "/ops/shipments", label: "Shipments & assets", icon: Truck },
  { href: "/ops/pricing", label: "Pricing & rates", icon: Settings2 },
];

// usePathname() inside Sidebar is request-time data, so it streams in behind a
// Suspense boundary; the fallback keeps the column's shape so nothing shifts.
function Fallback({ ops }: { ops?: boolean }) {
  return <div aria-hidden="true" className={`w-full md:w-[232px] md:shrink-0 ${ops ? "bg-ops-navy" : "bg-navy"}`} />;
}

export function PortalSidebar() {
  return (
    <Suspense fallback={<Fallback />}>
    <Sidebar
      items={clientItems}
      brand={{ title: "EOR Hub", subtitle: "Client portal" }}
      footer={
        <Link href="/ops" className="flex min-h-11 items-center gap-2 px-3 text-navy-text hover:text-white">
          Switch to Ops console
        </Link>
      }
    />
    </Suspense>
  );
}

export function OpsSidebar() {
  return (
    <Suspense fallback={<Fallback ops />}>
    <Sidebar
      variant="ops"
      items={opsItems}
      brand={{ title: "EOR Hub", subtitle: "Ops console · internal" }}
      footer={
        <Link href="/app" className="flex min-h-11 items-center gap-2 px-3 text-ops-text hover:text-white">
          ← Back to client portal
        </Link>
      }
    />
    </Suspense>
  );
}
