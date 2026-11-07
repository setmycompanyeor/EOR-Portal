"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

const credentials = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  next: z.string().optional(),
});

export async function signInWithPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { error: "Email or password is incorrect" };

  const next = parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/app";
  redirect(next);
}

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback` },
  });
  if (error) return { error: error.message };
  return { message: "Check your inbox for a sign-in link." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const passwordSchema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords do not match", path: ["confirm"] });

/** Sets (or changes) the signed-in user's password, then sends them to their portal. */
export async function setPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/password");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const ops = profile?.role === "ops_admin" || profile?.role === "ops_staff";
  redirect(ops ? "/ops" : "/app");
}
