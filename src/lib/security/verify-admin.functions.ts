import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Verifies the password of the OWNER admin of the currently authenticated user.
 * - If the user was created by an admin (profiles.created_by), checks against that admin's password.
 * - If the user is the admin themselves, checks against their own password.
 *
 * Returns { ok: true } when the password matches, { ok: false } otherwise.
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

    // Owner must actually have the admin role
    const { data: isAdmin, error: roleErr } = await supabaseAdmin.rpc("has_role", {
      _user_id: ownerId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) return { ok: false as const };

    // Get the owner admin's email
    const { data: adminUser, error: getErr } =
      await supabaseAdmin.auth.admin.getUserById(ownerId);
    if (getErr) throw new Error(getErr.message);
    const email = adminUser.user?.email;
    if (!email) return { ok: false as const };

    // Validate password with a throwaway client (does not affect current session)
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
    const { data: signIn, error: signErr } = await temp.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (signErr || !signIn.session) return { ok: false as const };
    // Clean up the temp session
    await temp.auth.signOut().catch(() => {});
    return { ok: true as const };
  });
