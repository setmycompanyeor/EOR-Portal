import { Suspense } from "react";
import { BRAND } from "@/lib/brand";
import { requireSession } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Set password" };

export default function PasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <span aria-hidden="true" className="inline-block h-[30px] w-[30px] rounded-lg bg-brand" />
          <div className="text-[15px] font-semibold">{BRAND}</div>
        </div>
        <Suspense fallback={<div className="card h-64 animate-pulse" />}>
          <Content />
        </Suspense>
      </div>
    </div>
  );
}

async function Content() {
  const session = await requireSession();
  return <PasswordForm email={session.email} />;
}
