import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listManagedUsers,
  createManagedUser,
  setUserPermissions,
  setUserResourcePermissions,
  setUserRole,
  deleteManagedUser,
} from "@/lib/permissions/admin.functions";
import { MANAGED_PAGES } from "@/lib/permissions/pages";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, Trash2, ShieldCheck, KeyRound, ShieldAlert } from "lucide-react";

type ResourcePerm = { resource_type: string; resource_id: string };

type ManagedUser = {
  id: string;
  email: string;
  nome: string | null;
  roles: string[];
  permissions: { page_key: string; can_view: boolean; can_edit: boolean }[];
  resource_permissions: ResourcePerm[];
};

export function UserManagementCard() {
  const qc = useQueryClient();
  const { isAdmin } = usePagePermissions();
  const listFn = useServerFn(listManagedUsers);
  const createFn = useServerFn(createManagedUser);
  const setPermFn = useServerFn(setUserPermissions);
  const setResFn = useServerFn(setUserResourcePermissions);
  const setRoleFn = useServerFn(setUserRole);
  const deleteFn = useServerFn(deleteManagedUser);


  const { data: users = [], isLoading } = useQuery({
    queryKey: ["managed-users"],
    queryFn: () => listFn({ data: undefined as unknown as never }),
  });

  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const createMut = useMutation({
    mutationFn: (data: { email: string; password: string; nome?: string; role?: "operador" | "gerente" }) =>
      createFn({ data }),
    onSuccess: () => {
      toast.success("Usuário criado");
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (user_id: string) => {
      // Senha admin ainda exigida para exclusão de usuário.
      const { guardAdmin } = await import("@/lib/security/guard-admin");
      await guardAdmin("excluir este usuário");
      return deleteFn({ data: { user_id } });
    },
    onSuccess: () => {
      toast.success("Usuário excluído");
      qc.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: async (e: Error) => {
      const { isAdminCancelled } = await import("@/lib/security/guard-admin");
      if (!isAdminCancelled(e)) toast.error(e.message);
    },
  });

  const roleMut = useMutation({
    mutationFn: async (v: { user_id: string; role: "operador" | "gerente" }) => {
      // Senha admin exigida para alterar papel.
      const { guardAdmin } = await import("@/lib/security/guard-admin");
      await guardAdmin(`alterar papel para "${v.role}"`);
      return setRoleFn({ data: v });
    },
    onSuccess: () => {
      toast.success("Papel atualizado");
      qc.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: async (e: Error) => {
      const { isAdminCancelled } = await import("@/lib/security/guard-admin");
      if (!isAdminCancelled(e)) toast.error(e.message);
    },
  });


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Usuários e permissões
        </CardTitle>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="mr-2 h-4 w-4" /> Novo usuário
            </Button>
          </DialogTrigger>
          <CreateUserDialog
            onSubmit={(d) => createMut.mutate(d)}
            loading={createMut.isPending}
            canCreateGerente={isAdmin}
          />
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{u.nome || u.email}</span>
                    {u.roles.includes("admin") && (
                      <Badge variant="secondary">admin</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-1">
                  {!u.roles.includes("admin") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingUser(u as ManagedUser)}
                    >
                      <KeyRound className="mr-2 h-3.5 w-3.5" /> Permissões
                    </Button>
                  )}
                  {!u.roles.includes("admin") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Excluir ${u.email}?`)) deleteMut.mutate(u.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {editingUser && (
        <PermissionsDialog
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={async ({ permissions, resources }) => {
            try {
              const { requireAdminPassword } = await import("@/components/admin-password/AdminPasswordGate");
              if (!(await requireAdminPassword(`alterar permissões de ${editingUser.email}`))) return;
              await setPermFn({ data: { user_id: editingUser.id, permissions } });
              await Promise.all(
                (Object.keys(resources) as Array<keyof typeof resources>).map((rt) =>
                  setResFn({ data: { user_id: editingUser.id, resource_type: rt as never, resource_ids: resources[rt] } })
                ),
              );
              toast.success("Permissões atualizadas");
              setEditingUser(null);
              qc.invalidateQueries({ queryKey: ["managed-users"] });
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}

    </Card>
  );
}

function CreateUserDialog({
  onSubmit,
  loading,
}: {
  onSubmit: (d: { email: string; password: string; nome?: string }) => void;
  loading: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo usuário</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ email, password, nome: nome || undefined });
        }}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Senha temporária</Label>
          <Input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <p className="text-xs text-muted-foreground">
            Compartilhe com o usuário; ele poderá alterar depois.
          </p>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={loading}>
            Criar usuário
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

type ResourceKind = "equipamento" | "tanque" | "produto" | "custom_sheet";

const RESOURCE_TABS: { key: ResourceKind; label: string; table: string; labelField: string; codeField?: string }[] = [
  { key: "equipamento", label: "Equipamentos", table: "equipamentos", labelField: "nome", codeField: "codigo" },
  { key: "tanque", label: "Locais (tanques)", table: "tanques", labelField: "nome", codeField: "codigo" },
  { key: "produto", label: "Produtos", table: "produtos", labelField: "nome", codeField: "codigo" },
  { key: "custom_sheet", label: "Tabelas", table: "custom_sheets", labelField: "nome" },
];

function PermissionsDialog({
  user,
  onClose,
  onSave,
}: {
  user: ManagedUser;
  onClose: () => void;
  onSave: (payload: {
    permissions: { page_key: string; can_view: boolean; can_edit: boolean }[];
    resources: Record<ResourceKind, string[]>;
  }) => void;
}) {
  const [state, setState] = useState(() =>
    MANAGED_PAGES.map((p) => {
      const existing = user.permissions.find((x) => x.page_key === p.key);
      return {
        page_key: p.key,
        label: p.label,
        can_view: existing?.can_view ?? false,
        can_edit: existing?.can_edit ?? false,
      };
    }),
  );

  const [resState, setResState] = useState<Record<ResourceKind, Set<string>>>(() => {
    const base: Record<ResourceKind, Set<string>> = {
      equipamento: new Set(),
      tanque: new Set(),
      produto: new Set(),
      custom_sheet: new Set(),
    };
    for (const rp of user.resource_permissions ?? []) {
      const k = rp.resource_type as ResourceKind;
      if (base[k]) base[k].add(rp.resource_id);
    }
    return base;
  });

  const toggle = (key: string, field: "can_view" | "can_edit", value: boolean) => {
    setState((s) =>
      s.map((row) =>
        row.page_key === key
          ? {
              ...row,
              [field]: value,
              ...(field === "can_edit" && value ? { can_view: true } : {}),
              ...(field === "can_view" && !value ? { can_edit: false } : {}),
            }
          : row,
      ),
    );
  };

  const toggleResource = (kind: ResourceKind, id: string) => {
    setResState((s) => {
      const next = new Set(s[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...s, [kind]: next };
    });
  };

  const setAllResources = (kind: ResourceKind, ids: string[], allChecked: boolean) => {
    setResState((s) => ({ ...s, [kind]: new Set(allChecked ? [] : ids) }));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Permissões — {user.nome || user.email}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="pages" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="pages">Páginas</TabsTrigger>
            {RESOURCE_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="pages" className="mt-3">
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2 pb-2 text-xs font-medium text-muted-foreground">
                <span>Página</span>
                <span className="w-16 text-center">Ver</span>
                <span className="w-16 text-center">Editar</span>
              </div>
              {state.map((row) => (
                <div
                  key={row.page_key}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <span className="text-sm">{row.label}</span>
                  <div className="flex w-16 justify-center">
                    <Checkbox checked={row.can_view} onCheckedChange={(v) => toggle(row.page_key, "can_view", !!v)} />
                  </div>
                  <div className="flex w-16 justify-center">
                    <Checkbox checked={row.can_edit} onCheckedChange={(v) => toggle(row.page_key, "can_edit", !!v)} />
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {RESOURCE_TABS.map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-3">
              <ResourcePicker
                kind={t.key}
                table={t.table}
                labelField={t.labelField}
                codeField={t.codeField}
                selected={resState[t.key]}
                onToggle={(id) => toggleResource(t.key, id)}
                onSetAll={(ids, allChecked) => setAllResources(t.key, ids, allChecked)}
              />
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() =>
              onSave({
                permissions: state.map((s) => ({
                  page_key: s.page_key,
                  can_view: s.can_view,
                  can_edit: s.can_edit,
                })),
                resources: {
                  equipamento: Array.from(resState.equipamento),
                  tanque: Array.from(resState.tanque),
                  produto: Array.from(resState.produto),
                  custom_sheet: Array.from(resState.custom_sheet),
                },
              })
            }
          >
            Salvar permissões
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResourcePicker({
  kind,
  table,
  labelField,
  codeField,
  selected,
  onToggle,
  onSetAll,
}: {
  kind: ResourceKind;
  table: string;
  labelField: string;
  codeField?: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSetAll: (ids: string[], allChecked: boolean) => void;
}) {
  const [rows, setRows] = useState<{ id: string; label: string; code?: string }[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cols = ["id", labelField, codeField].filter(Boolean).join(",");
      const { data, error } = await supabase.from(table as never).select(cols).order(labelField);
      if (cancelled) return;
      if (error) {
        setRows([]);
        return;
      }
      setRows(
        (data as unknown as Array<Record<string, string>>).map((r) => ({
          id: r.id,
          label: (r[labelField] as string) ?? "—",
          code: codeField ? (r[codeField] as string) : undefined,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [table, labelField, codeField]);

  if (rows === null) {
    return <p className="text-sm text-muted-foreground py-6">Carregando...</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-6">Nenhum item cadastrado.</p>;
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => r.label.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q))
    : rows;
  const ids = filtered.map((r) => r.id);
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Pesquisar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => onSetAll(ids, allChecked)}>
          {allChecked ? "Desmarcar todos" : "Selecionar todos"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Marque os itens que este usuário poderá visualizar e editar. Sem nenhum marcado, ele não verá nada deste recurso.
      </p>
      <div className="max-h-64 overflow-y-auto rounded-md border">
        {filtered.map((r) => (
          <label
            key={r.id}
            className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/50"
          >
            <Checkbox checked={selected.has(r.id)} onCheckedChange={() => onToggle(r.id)} />
            {r.code ? <span className="font-mono text-xs text-muted-foreground">{r.code}</span> : null}
            <span className="flex-1 truncate">{r.label}</span>
          </label>
        ))}
        {filtered.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">Nenhum item encontrado.</p>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{selected.size} selecionado(s)</p>
    </div>
  );
}

