"use client";

import { useActionState } from "react";
import { setPassword, type AuthState } from "@/app/(auth)/actions";

export function PasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(setPassword, {});
  return (
    <form action={action} className="card flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Set your password</h1>
        <p className="text-[13px] text-ink-muted">
          For <span className="font-medium text-ink">{email}</span>. You can also sign in with an emailed link at any time.
        </p>
      </div>
      <label className="label">
        New password
        <input className="input" type="password" name="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="label">
        Confirm password
        <input className="input" type="password" name="confirm" autoComplete="new-password" minLength={10} required />
      </label>
      <p aria-live="polite" className="min-h-5 text-[13px] text-red-ink">
        {state.error}
      </p>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save password and continue"}
      </button>
    </form>
  );
}
