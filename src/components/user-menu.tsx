import Link from "next/link";
import { Avatar } from "@/components/ui";
import { NotificationsBell, type NotificationItem } from "@/components/notifications";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { titleCase } from "@/lib/format";

/** Server component: reads the session, so render it inside a Suspense boundary. */
export async function UserMenu() {
  const session = await getSession();
  if (!session) return null;
  const { profile } = session;

  const sb = await createClient();
  const [{ data: items }, { count }] = await Promise.all([
    sb.from("notifications").select("id, title, body, href, read_at, created_at").eq("user_id", session.userId).order("created_at", { ascending: false }).limit(15),
    sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", session.userId).is("read_at", null),
  ]);

  return (
    <div className="flex items-center gap-3 text-[13px]">
      <NotificationsBell items={(items ?? []) as NotificationItem[]} unread={count ?? 0} />
      <Avatar name={profile.full_name || profile.email} />
      <div className="leading-tight">
        <div className="font-medium">{profile.full_name || profile.email}</div>
        <div className="text-ink-muted">{profile.job_title ?? titleCase(profile.role)}</div>
      </div>
      <Link href="/account/password" className="btn btn-sm">
        Password
      </Link>
      <form action={signOut}>
        <button type="submit" className="btn btn-sm">
          Sign out
        </button>
      </form>
    </div>
  );
}
