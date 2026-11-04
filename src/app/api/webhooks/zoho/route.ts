import { createAdminClient } from "@/lib/supabase/admin";
import { mapStatus } from "@/lib/zoho";

/**
 * Zoho Books webhook (configure a Workflow Rule on Invoices → Webhook with a custom
 * header `x-webhook-secret: <ZOHO_WEBHOOK_SECRET>` and a JSON body including
 * invoice_id, invoice_number, status, total, due_date, last_payment_date).
 * Updates the matching portal invoice's status in place.
 */
export async function POST(request: Request) {
  const secret = process.env.ZOHO_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const invoice = (body.invoice as Record<string, unknown> | undefined) ?? body;
  const invoiceId = String(invoice.invoice_id ?? "");
  if (!invoiceId) return new Response("invoice_id missing", { status: 400 });

  const status = mapStatus(String(invoice.status ?? "sent"));
  const patch: Record<string, unknown> = { status };
  if (invoice.total !== undefined) patch.total = Number(invoice.total);
  if (invoice.due_date) patch.due_date = String(invoice.due_date);
  if (status === "paid") patch.paid_at = invoice.last_payment_date ? String(invoice.last_payment_date) : new Date().toISOString().slice(0, 10);

  const admin = createAdminClient();
  const { data, error } = await admin.from("invoices").update(patch).eq("zoho_invoice_id", invoiceId).select("id, client_id, number");
  if (error) return new Response(error.message, { status: 500 });
  if (!data || data.length === 0) return Response.json({ ok: true, matched: 0 });

  await admin.from("activity_log").insert({ client_id: data[0].client_id, verb: `invoice.${status}`, summary: `Invoice ${data[0].number} marked ${status} (Zoho)`, subject_table: "invoices", subject_id: data[0].id });
  return Response.json({ ok: true, matched: data.length });
}
