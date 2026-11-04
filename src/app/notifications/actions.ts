"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationRead(id: string) {
  const { userId } = await requireSession();
  const sb = await createClient();
  await sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).is("read_at", null);
  revalidatePath("/app", "layout");
  revalidatePath("/ops", "layout");
}

export async function markAllNotificationsRead() {
  const { userId } = await requireSession();
  const sb = await createClient();
  await sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  revalidatePath("/app", "layout");
  revalidatePath("/ops", "layout");
}
