"use client";

import { useActionState, useState } from "react";
import { sendMagicLink, signInWithPassword, type AuthState } from "@/app/(auth)/actions";

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [pwState, pwAction, pwPending] = useActionState<AuthState, FormData>(signInWithPassword, {});
  const [linkState, linkAction, linkPending] = useActionState<AuthState, FormData>(sendMagicLink, {});

  const initial = error === "link" ? "That sign-in link has expired. Request a new one." : error === "no-client" ? "Your account is not linked to a client yet. Contact your account manager." : undefined;

  return (
    <div className="card flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-[13px] text-ink-muted">Use the email your account manager invited.</p>
      </div>

      <div className="flex gap-1 rounded-lg bg-canvas p-1 text-sm" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "password"} onClick={() => setMode("password")} className={`flex-1 rounded-md py-2 ${mode === "password" ? "bg-surface font-medium shadow-sm" : "text-ink-muted"}`}>
          Password
        </button>
        <button type="button" role="tab" aria-selected={mode === "link"} onClick={() => setMode("link")} className={`flex-1 rounded-md py-2 ${mode === "link" ? "bg-surface font-medium shadow-sm" : "text-ink-muted"}`}>
          Email me a link
        </button>
      </div>

      {mode === "password" ? (
        <form action={pwAction} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next ?? ""} />
          <label className="label">
            Work email
            <input className="input" type="email" name="email" autoComplete="email" required />
          </label>
          <label className="label">
            Password
            <input className="input" type="password" name="password" autoComplete="current-password" required />
          </label>
          <p aria-live="polite" className="min-h-5 text-[13px] text-red-ink">
            {pwState.error ?? initial}
          </p>
          <button type="submit" className="btn btn-primary" disabled={pwPending}>
            {pwPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form action={linkAction} className="flex flex-col gap-3">
          <label className="label">
            Work email
            <input className="input" type="email" name="email" autoComplete="email" required />
          </label>
          <p aria-live="polite" className={`min-h-5 text-[13px] ${linkState.error ? "text-red-ink" : "text-green-ink"}`}>
            {linkState.error ?? linkState.message ?? initial}
          </p>
          <button type="submit" className="btn btn-primary" disabled={linkPending}>
            {linkPending ? "Sending…" : "Send sign-in link"}
          </button>
        </form>
      )}
    </div>
  );
}
