import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * In-portal notifications. Fan-out happens in SECURITY DEFINER SQL functions
 * (supabase/migrations/0002_notifications.sql) so a client user can notify ops
 * and vice versa without widening table policies. Failures are swallowed:
 * a notification must never break the action that triggered it.
 */
export async function notifyClient(clientId: string, title: string, body?: string, href?: string) {
  try {
    const sb = await createClient();
    await sb.rpc("notify_client_users", { p_client_id: clientId, p_title: title, p_body: body ?? null, p_href: href ?? null });
  } catch {
    /* ignore */
  }
}

export async function notifyOps(clientId: string | null, title: string, body?: string, href?: string) {
  try {
    const sb = await createClient();
    await sb.rpc("notify_ops", { p_client_id: clientId, p_title: title, p_body: body ?? null, p_href: href ?? null });
  } catch {
    /* ignore */
  }
}
