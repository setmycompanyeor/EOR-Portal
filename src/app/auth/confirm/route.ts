import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const types: EmailOtpType[] = ["invite", "magiclink", "recovery", "signup", "email_change", "email"];

/**
 * Verifies a token-hash link (from `scripts/create-login.ts` or an email template that
 * uses {{ .TokenHash }}) and signs the user in. Unlike /auth/callback this does not
 * depend on a PKCE code, so links generated server-side work in any browser.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = request.nextUrl.searchParams.get("next") ?? "/app";
  const origin = request.nextUrl.origin;

  if (tokenHash && type && types.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/app"}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
