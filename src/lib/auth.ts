import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type Session = { userId: string; email: string; profile: Profile };

/** Reads the Supabase session and the user's profile once per request. Null when signed out. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return null;
  return { userId: user.id, email: user.email ?? "", profile: profile as Profile };
});

export function isOpsRole(role: Profile["role"]) {
  return role === "ops_admin" || role === "ops_staff";
}

export function canApproveRole(role: Profile["role"]) {
  return role === "client_admin" || role === "client_approver";
}

/** Any signed-in user; redirects to /login otherwise. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** A client-portal user with a tenant. Ops users are sent to the ops console. */
export async function requireClient(): Promise<Session & { clientId: string }> {
  const session = await requireSession();
  if (isOpsRole(session.profile.role)) redirect("/ops");
  if (!session.profile.client_id) redirect("/login?error=no-client");
  return { ...session, clientId: session.profile.client_id };
}

/** An internal ops user. Client users are sent back to the portal. */
export async function requireOps(): Promise<Session> {
  const session = await requireSession();
  if (!isOpsRole(session.profile.role)) redirect("/app");
  return session;
}
