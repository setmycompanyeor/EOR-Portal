import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EmployeeLetter, LetterKind, LetterTemplate } from "@/lib/types";

export async function getTemplates() {
  const sb = await createClient();
  const { data } = await sb.from("letter_templates").select("*, clients(name)").order("created_at", { ascending: false });
  return (data ?? []) as (LetterTemplate & { clients: { name: string } | null })[];
}

/** Active templates a client may use: their own plus the global ones. */
export async function getTemplatesForClient(clientId: string, kind: LetterKind = "offer_letter") {
  const sb = await createClient();
  const { data } = await sb
    .from("letter_templates")
    .select("*")
    .eq("kind", kind)
    .eq("active", true)
    .or(`client_id.eq.${clientId},client_id.is.null`)
    .order("client_id", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as LetterTemplate[];
}

export async function getLetter(employeeId: string, kind: LetterKind = "offer_letter") {
  const sb = await createClient();
  const { data } = await sb.from("employee_letters").select("*").eq("employee_id", employeeId).eq("kind", kind).maybeSingle();
  return data as EmployeeLetter | null;
}
