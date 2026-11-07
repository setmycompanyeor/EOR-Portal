import { requireOps } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Streams a generated letter (.docx) to EOR ops for review. */
export async function GET(_req: Request, ctx: RouteContext<"/api/letters/[id]">) {
  await requireOps();
  const { id } = await ctx.params;
  const sb = await createClient();
  const { data: letter } = await sb.from("employee_letters").select("generated_path, kind, employees(full_name)").eq("id", id).single();
  const path = letter?.generated_path;
  if (!path) return new Response("Not generated", { status: 404 });
  const { data, error } = await sb.storage.from("documents").download(path);
  if (error || !data) return new Response("Not found", { status: 404 });
  const emp = (letter.employees as unknown as { full_name: string } | null)?.full_name ?? "employee";
  const filename = `${letter.kind.replace(/_/g, "-")}-${emp.replace(/[^\w.\-]+/g, "_")}.docx`;
  return new Response(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
