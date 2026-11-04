import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

/** Per-request Supabase client that acts as the signed-in user (RLS applies). */
export async function createClient() {
  // Marks the render as request-time before supabase-js reads the clock for
  // token expiry (Cache Components would otherwise flag Date.now() in prerender).
  await connection();
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies can't be written here.
          // proxy.ts refreshes the session cookie instead.
        }
      },
    },
  });
}
