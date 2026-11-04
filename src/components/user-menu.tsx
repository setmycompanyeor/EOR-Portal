import { Avatar } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { titleCase } from "@/lib/format";

/** Server component: reads the session, so render it inside a Suspense boundary. */
export async function UserMenu() {
  const session = await getSession();
  if (!session) return null;
  const { profile } = session;
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <Avatar name={profile.full_name || profile.email} />
      <div className="leading-tight">
        <div className="font-medium">{profile.full_name || profile.email}</div>
        <div className="text-ink-muted">{profile.job_title ?? titleCase(profile.role)}</div>
      </div>
      <form action={signOut}>
        <button type="submit" className="btn btn-sm">
          Sign out
        </button>
      </form>
    </div>
  );
}
