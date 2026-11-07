/**
 * Creates a portal login without sending any email: makes the user (or reuses an
 * existing one) and writes a one-time sign-in link to .local/login-links.txt.
 * Opening the link signs the person in and asks them to set a password.
 *
 *   npm run create-login -- --email jai@example.com --name "Jai Shah" --role ops_admin
 *   npm run create-login -- --email cfo@client.com --name "A. Client" --role client_admin --client <client uuid>
 *   npm run create-login -- --email jai@example.com --app-url https://eor-portal.vercel.app   # link for production
 *
 * Roles: ops_admin, ops_staff (internal) · client_admin, client_approver, client_viewer (need --client).
 * The link expires after the project's email OTP expiry (one hour by default) and works once.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { appendFileSync, mkdirSync } from "node:fs";

const ROLES = ["ops_admin", "ops_staff", "client_admin", "client_approver", "client_viewer"] as const;
type Role = (typeof ROLES)[number];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim() ?? "";
const role = arg("role") as Role | undefined;
const clientId = arg("client");
const appUrl = (arg("app-url") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!email || !email.includes("@")) {
  console.error("Pass --email <address>");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: profile } = await sb.from("profiles").select("id, role, client_id").eq("email", email!).maybeSingle();
  let type: "invite" | "magiclink" = "invite";

  if (profile) {
    console.log(`${email} already exists (${profile.role}); creating a fresh sign-in link.`);
    type = "magiclink";
  } else {
    if (!role || !ROLES.includes(role)) {
      console.error(`Pass --role one of: ${ROLES.join(", ")}`);
      process.exit(1);
    }
    const isClientRole = role.startsWith("client_");
    if (isClientRole && !clientId) {
      console.error("Client roles need --client <client uuid> (see /ops/clients).");
      process.exit(1);
    }
    if (isClientRole) {
      const { data: client } = await sb.from("clients").select("id, name").eq("id", clientId!).maybeSingle();
      if (!client) {
        console.error(`No client with id ${clientId}`);
        process.exit(1);
      }
      console.log(`Creating ${role} for ${client.name}.`);
    }
  }

  const { data, error } = await sb.auth.admin.generateLink({
    type,
    email: email!,
    options: {
      data: type === "invite" ? { full_name: name, role, client_id: clientId ?? "" } : undefined,
    },
  });
  if (error || !data.properties?.hashed_token) {
    console.error(`Could not create the link: ${error?.message ?? "no token returned"}`);
    process.exit(1);
  }

  const link = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=${type}&next=/account/password`;
  mkdirSync(".local", { recursive: true });
  const file = ".local/login-links.txt";
  appendFileSync(file, `${new Date().toISOString()}  ${email}  (${profile?.role ?? role})\n${link}\n\n`);
  console.log(`Sign-in link for ${email} written to ${file} (one use, expires in about an hour).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
