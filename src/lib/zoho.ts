import "server-only";

/**
 * Minimal Zoho Books client. Uses a long-lived refresh token (generated once from the
 * Zoho API console with scope ZohoBooks.invoices.READ,ZohoBooks.contacts.READ) to mint
 * access tokens on demand. Indian data centre by default (.in domains).
 */

export type ZohoInvoice = {
  invoice_id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  date: string;
  due_date: string;
  status: string; // draft | sent | overdue | paid | partially_paid | unpaid | void
  sub_total: number;
  tax_total: number;
  total: number;
  last_payment_date?: string;
  reference_number?: string;
};

export function zohoConfigured() {
  return Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_ORGANIZATION_ID);
}

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const accounts = process.env.ZOHO_ACCOUNTS_DOMAIN ?? "https://accounts.zoho.in";
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    grant_type: "refresh_token",
  });
  const res = await fetch(`${accounts}/oauth/v2/token`, { method: "POST", body: params });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`Zoho token refresh failed: ${json.error ?? res.status}`);
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const base = process.env.ZOHO_API_DOMAIN ?? "https://www.zohoapis.in";
  const url = new URL(`${base}/books/v3${path}`);
  url.searchParams.set("organization_id", process.env.ZOHO_ORGANIZATION_ID!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}` } });
  const json = (await res.json()) as T & { code?: number; message?: string };
  if (!res.ok || (json.code !== undefined && json.code !== 0)) throw new Error(`Zoho API ${path}: ${json.message ?? res.status}`);
  return json;
}

/** All invoices for one Zoho customer (contact), newest first, paging through results. */
export async function listInvoicesForCustomer(customerId: string): Promise<ZohoInvoice[]> {
  const out: ZohoInvoice[] = [];
  for (let page = 1; page < 20; page++) {
    const json = await api<{ invoices: ZohoInvoice[]; page_context?: { has_more_page?: boolean } }>("/invoices", {
      customer_id: customerId,
      sort_column: "date",
      sort_order: "D",
      per_page: "200",
      page: String(page),
    });
    out.push(...(json.invoices ?? []));
    if (!json.page_context?.has_more_page) break;
  }
  return out;
}

export async function getInvoice(invoiceId: string): Promise<ZohoInvoice> {
  const json = await api<{ invoice: ZohoInvoice }>(`/invoices/${invoiceId}`);
  return json.invoice;
}

/** Maps a Zoho invoice status onto the portal's. */
export function mapStatus(status: string): "draft" | "sent" | "paid" | "overdue" | "void" {
  switch (status) {
    case "paid":
      return "paid";
    case "overdue":
      return "overdue";
    case "void":
      return "void";
    case "draft":
      return "draft";
    default:
      return "sent"; // sent, unpaid, partially_paid, viewed
  }
}
