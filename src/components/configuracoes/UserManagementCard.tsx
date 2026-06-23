import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listManagedUsers,
  createManagedUser,
  setUserPermissions,
  deleteManagedUser,
} from "@/lib/permissions/admin.functions";
import { MANAGED_PAGES } from "@/lib/permissions/pages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Trash2, ShieldCheck, KeyRound } from "lucide-react";

type ManagedUser = {
  id: string;
  email: string;
  nome: string | null;
  roles: string[];
  permissions: { page_key: string; can_view: boolean; can_edit: boolean }[];
};

export function UserManagementCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listManagedUsers);
  const createFn = useServerFn(createManagedUser);
  const setPermFn = useServerFn(setUserPermissions);
  const deleteFn = useServerFn(deleteManagedUser);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["managed-users"],
    queryFn: () => listFn({ data: undefined as unknown as never }),
  });

  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const createMut = useMutation({
    mutationFn: (data: { email: string; password: string; nome?: string }) =>
      createFn({ data }),
    onSuccess: () => {
      toast.success("Usuário criado");
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (user_id: string) => deleteFn({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Usuário excluído");
      qc.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
          <CreateUserDialog onSubmit={(d) => createMut.mutate(d)} loading={createMut.isPending} />
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
          onSave={async (permissions) => {
            try {
              await setPermFn({ data: { user_id: editingUser.id, permissions } });
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

function PermissionsDialog({
  user,
  onClose,
  onSave,
}: {
  user: ManagedUser;
  onClose: () => void;
  onSave: (
    perms: { page_key: string; can_view: boolean; can_edit: boolean }[],
  ) => void;
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

  const toggle = (key: string, field: "can_view" | "can_edit", value: boolean) => {
    setState((s) =>
      s.map((row) =>
        row.page_key === key
          ? {
              ...row,
              [field]: value,
              // editing implies viewing
              ...(field === "can_edit" && value ? { can_view: true } : {}),
              ...(field === "can_view" && !value ? { can_edit: false } : {}),
            }
          : row,
      ),
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Permissões — {user.nome || user.email}</DialogTitle>
        </DialogHeader>
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
                <Checkbox
                  checked={row.can_view}
                  onCheckedChange={(v) => toggle(row.page_key, "can_view", !!v)}
                />
              </div>
              <div className="flex w-16 justify-center">
                <Checkbox
                  checked={row.can_edit}
                  onCheckedChange={(v) => toggle(row.page_key, "can_edit", !!v)}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              onSave(
                state.map((s) => ({
                  page_key: s.page_key,
                  can_view: s.can_view,
                  can_edit: s.can_edit,
                })),
              )
            }
          >
            Salvar permissões
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
