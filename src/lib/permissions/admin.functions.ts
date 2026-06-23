import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const listManagedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: usersData, error: usersErr } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (usersErr) throw new Error(usersErr.message);

    const ids = usersData.users.map((u) => u.id);
    const [{ data: roles }, { data: perms }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin
        .from("user_permissions")
        .select("user_id, page_key, can_view, can_edit")
        .in("user_id", ids),
      supabaseAdmin.from("profiles").select("id, nome").in("id", ids),
    ]);

    return usersData.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      nome: profiles?.find((p) => p.id === u.id)?.nome ?? null,
      roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role),
      permissions: (perms ?? [])
        .filter((p) => p.user_id === u.id)
        .map((p) => ({
          page_key: p.page_key,
          can_view: p.can_view,
          can_edit: p.can_edit,
        })),
    }));
  });

export const createManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; nome?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: data.nome ?? data.email.split("@")[0] },
    });
    if (error) throw new Error(error.message);
    const newId = created.user!.id;

    // handle_new_user trigger creates profile + grants 'admin' role.
    // Demote to 'operador' so admin role is reserved for the first owner.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newId, role: "operador" });

    return { id: newId };
  });

export const setUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      user_id: string;
      permissions: { page_key: string; can_view: boolean; can_edit: boolean }[];
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("user_permissions").delete().eq("user_id", data.user_id);
    const rows = data.permissions
      .filter((p) => p.can_view || p.can_edit)
      .map((p) => ({
        user_id: data.user_id,
        page_key: p.page_key,
        can_view: p.can_view,
        can_edit: p.can_edit,
      }));
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("user_permissions").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId) {
      throw new Error("Você não pode excluir a si mesmo.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
