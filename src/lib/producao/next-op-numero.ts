import { supabase } from "@/integrations/supabase/client";

/**
 * Reserves and returns the next sequential OP number for the current tenant.
 * Numbers start at 100 and are shared across manual, scheduled and automation OPs.
 */
export async function fetchNextOpNumero(): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) throw new Error("Sessão expirada");
  const { data: ownerId, error: oErr } = await supabase.rpc("effective_owner", { _user: uid });
  if (oErr || !ownerId) throw new Error(oErr?.message ?? "Tenant não resolvido");
  const { data, error } = await supabase.rpc("next_op_numero", { _owner: ownerId as string });
  if (error) throw new Error(error.message);
  return String(data);
}
