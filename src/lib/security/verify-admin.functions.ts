import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Verifies the password of ANY admin or gerente belonging to the same tenant
 * (effective owner) as the currently authenticated user.
 *
 * Returns { ok: true } when the password matches one of them, { ok: false } otherwise.
 * Never reveals which email is being checked.
 */
export const verifyOwnerAdminPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { password: string }) => {
    if (!d || typeof d.password !== "string" || d.password.length === 0) {
      throw new Error("Senha obrigatória");
    }
    if (d.password.length > 200) throw new Error("Senha inválida");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find the effective owner (admin) for this user
    const { data: ownerRow, error: ownerErr } = await supabaseAdmin.rpc(
      "effective_owner",
      { _user: context.userId },
    );
    if (ownerErr) throw new Error(ownerErr.message);
    const ownerId = ownerRow as string | null;
    if (!ownerId) return { ok: false as const };

    // Gather every user of this tenant (the owner + users created by the owner)
    const { data: memberRows, error: membersErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .or(`id.eq.${ownerId},created_by.eq.${ownerId}`);
    if (membersErr) throw new Error(membersErr.message);
    const memberIds = (memberRows ?? []).map((r) => r.id);
    if (memberIds.length === 0) return { ok: false as const };

    // Keep only members with admin or gerente role
    const { data: roleRows, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", memberIds)
      .in("role", ["admin", "gerente"]);
    if (rolesErr) throw new Error(rolesErr.message);
    const privilegedIds = [...new Set((roleRows ?? []).map((r) => r.user_id))];
    if (privilegedIds.length === 0) return { ok: false as const };

    // Validate the password against each privileged user's account with a
    // throwaway client (does not affect the current session). Stop at the
    // first match. Cap attempts to avoid abuse on very large teams.
    const { createClient } = await import("@supabase/supabase-js");
    const temp = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );

    for (const uid of privilegedIds.slice(0, 15)) {
      const { data: u, error: getErr } = await supabaseAdmin.auth.admin.getUserById(uid);
      if (getErr) continue;
      const email = u.user?.email;
      if (!email) continue;
      const { data: signIn, error: signErr } = await temp.auth.signInWithPassword({
        email,
        password: data.password,
      });
      if (!signErr && signIn.session) {
        // Clean up only the throwaway client state. A global signOut here
        // revokes the real browser session when the signer is the current user.
        await temp.auth.signOut({ scope: "local" }).catch(() => {});
        return { ok: true as const };
      }
    }
    return { ok: false as const };
  });
