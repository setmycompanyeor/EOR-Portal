"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPricing } from "@/lib/data/portal";
import { getSession } from "@/lib/auth";
import { estimate } from "@/lib/pricing";

const payload = z.object({
  monthlyGross: z.number().min(0).max(10_000_000),
  headcount: z.number().int().min(1).max(500),
  pfOnFullBasic: z.boolean(),
  gstOnFullInvoice: z.boolean(),
  email: z.string().email().optional(),
});

/** Saves an estimate: for the signed-in client when there is one, otherwise as a public lead. */
export async function saveEstimate(input: z.infer<typeof payload>): Promise<{ message: string }> {
  const parsed = payload.safeParse(input);
  if (!parsed.success) return { message: "Check the inputs and try again." };

  const session = await getSession();
  const clientId = session?.profile.client_id ?? null;
  const config = await getPricing(clientId);
  const result = estimate(parsed.data, config);

  const sb = await createClient();
  const { error } = await sb.from("estimates").insert({
    client_id: clientId,
    inputs: parsed.data,
    result,
    contact_email: parsed.data.email ?? null,
    created_by: session?.userId ?? null,
  });
  if (error) return { message: "Could not save right now. The numbers above are still valid." };
  return { message: clientId ? "Saved to your estimates." : "Saved. We will be in touch if you left an email." };
}
