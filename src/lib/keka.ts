import "server-only";

/**
 * Minimal Keka client (HRIS, leave, expense). Auth is Keka's `kekaapi` grant:
 * client id + secret + API key exchanged for a bearer token at login.keka.com.
 *
 * Env: KEKA_COMPANY (subdomain), KEKA_ENVIRONMENT (keka | kekademo),
 * KEKA_CLIENT_ID, KEKA_CLIENT_SECRET, KEKA_API_KEY, KEKA_PAID_STATUS (int).
 *
 * Enum values below come from Keka's reference pages; names for paymentStatus
 * are not documented, so the "paid" value is configurable.
 */

export const LEAVE_STATUS = { pending: 0, approved: 1, rejected: 2, cancelled: 3, inApproval: 4 } as const;
export const CLAIM_APPROVAL = { none: 0, pending: 1, submitted: 2, approved: 3, rejected: 4, paid: 5, inApproval: 6 } as const;

export type KekaEmployee = { id: string; employeeNumber?: string; displayName?: string; email?: string; personalEmail?: string; employmentStatus?: number; jobTitle?: { identifier?: string; title?: string } | null };
export type KekaLeave = {
  id: string;
  employeeIdentifier: string;
  fromDate: string;
  toDate: string;
  fromSession?: number;
  toSession?: number;
  requestedOn?: string;
  note?: string | null;
  cancelRejectReason?: string | null;
  status: number;
  selection?: { leaveTypeIdentifier?: string; leaveTypeName?: string; count?: number; duration?: number }[];
};
export type KekaExpense = { id: string; title?: string; date?: string; expenseCategoryId?: string; amount?: string | number; comment?: string | null; attachments?: { id: string; name: string }[] };
export type KekaClaim = { id: string; employeeIdentifier: string; employeeName?: string; claimNumber?: string; title?: string; paymentStatus: number; submittedOn?: string; approvalStatus: number; expenses?: KekaExpense[] };
type Paged<T> = { succeeded?: boolean; message?: string; data?: T[]; totalPages?: number; pageNumber?: number };

export function kekaConfigured() {
  return Boolean(process.env.KEKA_COMPANY && process.env.KEKA_CLIENT_ID && process.env.KEKA_CLIENT_SECRET && process.env.KEKA_API_KEY);
}

const env = () => process.env.KEKA_ENVIRONMENT === "kekademo" ? "kekademo" : "keka";
const base = () => `https://${process.env.KEKA_COMPANY}.${env()}.com/api/v1`;

let cached: { token: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://login.${env()}.com/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "user-agent": "Mozilla" },
    body: new URLSearchParams({
      grant_type: "kekaapi",
      scope: "kekaapi",
      client_id: process.env.KEKA_CLIENT_ID!,
      client_secret: process.env.KEKA_CLIENT_SECRET!,
      api_key: process.env.KEKA_API_KEY!,
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`Keka token failed: ${json.error ?? res.status}`);
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function get<T>(path: string, params: Record<string, string>): Promise<Paged<T>> {
  const url = new URL(`${base()}${path}`);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}`, "user-agent": "Mozilla", Accept: "application/json" } });
  const json = (await res.json().catch(() => ({}))) as Paged<T>;
  if (!res.ok) throw new Error(`Keka ${path}: ${json.message ?? res.status}`);
  return json;
}

/** Walks every page of a paged endpoint. */
async function all<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const json = await get<T>(path, { ...params, pageNumber: String(page), pageSize: "200" });
    out.push(...(json.data ?? []));
    if (!json.totalPages || page >= json.totalPages) break;
  }
  return out;
}

export const listEmployees = () => all<KekaEmployee>("/hris/employees");

/** Leave requests whose dates fall in [from, to]; Keka caps the window at 90 days. */
export const listLeaveRequests = (from: Date, to: Date, employeeIds?: string[]) =>
  all<KekaLeave>("/time/leaverequests", { from: from.toISOString(), to: to.toISOString(), employeeIds: employeeIds?.join(",") ?? "" });

export const listExpenseClaims = (employeeIds?: string[]) => all<KekaClaim>("/expense/claims", { employeeIds: employeeIds?.join(",") ?? "" });

export async function listExpenseCategories(): Promise<Map<string, string>> {
  try {
    const rows = await all<{ id: string; name?: string; title?: string }>("/expense/categories");
    return new Map(rows.map((r) => [r.id, r.name ?? r.title ?? "Expense"]));
  } catch {
    return new Map();
  }
}

/** Marks a claim paid in Keka after it has been billed and settled. */
export async function markClaimPaid(claimId: string, paidOn: Date, comment: string) {
  const paidStatus = Number(process.env.KEKA_PAID_STATUS ?? 1);
  const res = await fetch(`${base()}/expense/claims/${claimId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", "user-agent": "Mozilla" },
    body: JSON.stringify({ paymentStatus: paidStatus, paymentDate: paidOn.toISOString(), comment }),
  });
  const json = (await res.json().catch(() => ({}))) as { succeeded?: boolean; message?: string };
  if (!res.ok || json.succeeded === false) throw new Error(`Keka mark paid: ${json.message ?? res.status}`);
}

export function claimTotal(c: KekaClaim) {
  return (c.expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

export function leaveSummary(l: KekaLeave) {
  const sel = l.selection ?? [];
  const type = sel.map((s) => s.leaveTypeName).filter(Boolean).join(", ") || "Leave";
  const days = sel.reduce((s, x) => s + (Number(x.count ?? x.duration) || 0), 0);
  return { type, days };
}
