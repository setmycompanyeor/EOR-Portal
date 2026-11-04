import { Suspense } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <span aria-hidden="true" className="inline-block h-[30px] w-[30px] rounded-lg bg-brand" />
          <div>
            <div className="text-[15px] font-semibold">{BRAND}</div>
            <div className="text-xs text-ink-muted">Client portal</div>
          </div>
        </div>
        <Suspense fallback={<div className="card h-72 animate-pulse" />}>
          {searchParams.then((sp) => (
            <LoginForm next={typeof sp.next === "string" ? sp.next : undefined} error={typeof sp.error === "string" ? sp.error : undefined} />
          ))}
        </Suspense>
        <p className="mt-6 text-center text-[13px] text-ink-muted">
          Not a client yet? <Link href="/estimate">Estimate your cost to hire in India</Link>
        </p>
      </div>
    </div>
  );
}
