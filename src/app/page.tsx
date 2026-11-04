import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Calculator, ClipboardList, Inbox, ShieldCheck, Truck, Wallet } from "lucide-react";

const features = [
  { icon: Calculator, title: "Know the full cost before you offer", text: "Gross salary in, every employer cost out: PF, ESI, gratuity, insurance, our fee and GST." },
  { icon: ClipboardList, title: "Onboard in days, not weeks", text: "Company KYC, agreements and deposit tracked step by step. Hires move through a checklist you can see." },
  { icon: Wallet, title: "Deposits and invoices, transparent", text: "See what is held, what is required and why. Every invoice synced from our books." },
  { icon: Inbox, title: "Request, quote, approve", text: "Laptops, insurance add-ons, meal cards. We quote, you approve in one click, we deliver." },
  { icon: Truck, title: "Track every shipment", text: "Courier status and asset register for all equipment issued to your team." },
  { icon: ShieldCheck, title: "Compliance you can prove", text: "PF, ESI and TDS filings with challans available to download for your records." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="inline-block h-[30px] w-[30px] rounded-lg bg-brand" />
          <span className="text-[15px] font-semibold">{BRAND}</span>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/estimate" className="btn btn-sm">
            Cost estimator
          </Link>
          <Link href="/login" className="btn btn-sm btn-primary">
            Client sign in
          </Link>
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-6 py-16 md:px-12 md:py-24">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">Hire in India without setting up an entity.</h1>
        <p className="max-w-xl text-lg text-ink-muted">
          We employ your people in India on your behalf, run payroll and compliance, and give you one portal to see all of it.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/estimate" className="btn btn-primary">
            Estimate your monthly cost
          </Link>
          <Link href="/login" className="btn">
            Sign in to the portal
          </Link>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 px-6 pb-20 md:grid-cols-3 md:px-12">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card flex flex-col gap-2">
            <Icon size={20} className="text-brand" aria-hidden="true" />
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <p className="text-sm text-ink-muted">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
