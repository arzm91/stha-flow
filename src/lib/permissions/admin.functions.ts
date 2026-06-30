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

    // Only users created by the current admin, plus the admin's own profile.
    const { data: ownedProfiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, nome, created_by")
      .or(`created_by.eq.${context.userId},id.eq.${context.userId}`);
    if (profErr) throw new Error(profErr.message);

    const ids = (ownedProfiles ?? []).map((p) => p.id);
    if (ids.length === 0) return [];

    const { data: usersData, error: usersErr } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (usersErr) throw new Error(usersErr.message);
    const usersById = new Map(usersData.users.map((u) => [u.id, u]));

    const [{ data: roles }, { data: perms }, { data: resPerms }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin
        .from("user_permissions")
        .select("user_id, page_key, can_view, can_edit")
        .in("user_id", ids),
      supabaseAdmin
        .from("user_resource_permissions")
        .select("user_id, resource_type, resource_id")
        .in("user_id", ids),
    ]);

    return ids
      .map((id) => {
        const u = usersById.get(id);
        if (!u) return null;
        return {
          id,
          email: u.email ?? "",
          created_at: u.created_at,
          nome: ownedProfiles?.find((p) => p.id === id)?.nome ?? null,
          roles: (roles ?? []).filter((r) => r.user_id === id).map((r) => r.role),
          permissions: (perms ?? [])
            .filter((p) => p.user_id === id)
            .map((p) => ({
              page_key: p.page_key,
              can_view: p.can_view,
              can_edit: p.can_edit,
            })),
          resource_permissions: (resPerms ?? [])
            .filter((p) => p.user_id === id)
            .map((p) => ({
              resource_type: p.resource_type as string,
              resource_id: p.resource_id as string,
            })),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  });


async function assertOwnsUser(
  ctx: { userId: string },
  supabaseAdmin: any,
  targetId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("created_by")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.created_by !== ctx.userId) {
    throw new Error("Forbidden: usuário não pertence a você.");
  }
}

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
    // Demote to 'operador' and stamp ownership.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newId, role: "operador" });
    await supabaseAdmin
      .from("profiles")
      .update({ created_by: context.userId })
      .eq("id", newId);

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
    await assertOwnsUser(context, supabaseAdmin, data.user_id);

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

const ALLOWED_RESOURCE_TYPES = ["equipamento", "tanque", "produto", "custom_sheet"] as const;
type AllowedResourceType = (typeof ALLOWED_RESOURCE_TYPES)[number];

export const setUserResourcePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      user_id: string;
      resource_type: AllowedResourceType;
      resource_ids: string[];
    }) => {
      if (!ALLOWED_RESOURCE_TYPES.includes(d.resource_type)) {
        throw new Error("resource_type inválido");
      }
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwnsUser(context, supabaseAdmin, data.user_id);

    await supabaseAdmin
      .from("user_resource_permissions")
      .delete()
      .eq("user_id", data.user_id)
      .eq("resource_type", data.resource_type);

    const unique = Array.from(new Set(data.resource_ids.filter(Boolean)));
    if (unique.length > 0) {
      const rows = unique.map((rid) => ({
        user_id: data.user_id,
        resource_type: data.resource_type,
        resource_id: rid,
      }));
      const { error } = await supabaseAdmin
        .from("user_resource_permissions")
        .insert(rows);
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
    await assertOwnsUser(context, supabaseAdmin, data.user_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
