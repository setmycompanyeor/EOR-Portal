import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Keka webhook receiver. Configure in Keka (Settings → Event Triggers) with a
 * custom header `x-webhook-secret: <KEKA_WEBHOOK_SECRET>`. Supports the
 * documented `leaverequestcreated` event; other events are acknowledged and
 * ignored. The employee is matched on employees.keka_employee_id.
 *
 * Keka does not sign webhooks, so the shared secret is the only guard; treat
 * the payload as a prompt to create a pending approval, never as truth.
 */
export async function POST(request: Request) {
  const secret = process.env.KEKA_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = Object.fromEntries(new URLSearchParams(text)) as Record<string, unknown>;
    }
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const eventType = String(body.eventType ?? "").toLowerCase();
  const kekaEmployeeId = String(body.employeeIdentifier ?? body.employeeIndentifier ?? "");
  if (!kekaEmployeeId) return Response.json({ ok: true, ignored: "no employee" });

  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("id, client_id, full_name").eq("keka_employee_id", kekaEmployeeId).maybeSingle();
  if (!emp) return Response.json({ ok: true, ignored: "unknown employee" });

  if (eventType === "leaverequestcreated") {
    const leaveType = String(body.leaveType ?? "Leave");
    const duration = body.duration ? ` (${String(body.duration)} day${Number(body.duration) === 1 ? "" : "s"})` : "";
    const { data, error } = await admin
      .from("approvals")
      .insert({
        client_id: emp.client_id,
        employee_id: emp.id,
        kind: "leave",
        title: `${leaveType}${duration}`,
        detail: [body.leaveReason, body.leaveNote].filter(Boolean).map(String).join(" · ") || null,
        from_date: body.fromDate ? String(body.fromDate).slice(0, 10) : null,
        to_date: body.toDate ? String(body.toDate).slice(0, 10) : null,
        leave_type: leaveType,
        keka_reference: body.id ? String(body.id) : null,
      })
      .select("id")
      .single();
    if (error) return new Response(error.message, { status: 500 });
    await admin.rpc("notify_client_users", { p_client_id: emp.client_id, p_title: `Leave request: ${emp.full_name}`, p_body: `${leaveType}${duration}`, p_href: "/app/approvals" });
    return Response.json({ ok: true, approvalId: data.id });
  }

  return Response.json({ ok: true, ignored: eventType || "unknown event" });
}
