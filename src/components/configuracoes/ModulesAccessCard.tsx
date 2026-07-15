import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listManagedUsers, setUserPermissions } from "@/lib/permissions/admin.functions";
import { MANAGED_PAGES } from "@/lib/permissions/pages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Lock, ShieldCheck, LockOpen } from "lucide-react";

const MASTER_PASSWORD = "bra@131";
const UNLOCK_KEY = "modules_master_unlocked";

type ManagedUser = {
  id: string;
  email: string;
  nome: string | null;
  roles: string[];
  permissions: { page_key: string; can_view: boolean; can_edit: boolean }[];
};

export function ModulesAccessCard() {
  const qc = useQueryClient();
  const [unlocked, setUnlocked] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(UNLOCK_KEY) === "1",
  );
  const [password, setPassword] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const listFn = useServerFn(listManagedUsers);
  const setPermFn = useServerFn(setUserPermissions);

  const { data: users = [] } = useQuery({
    queryKey: ["managed-users"],
    queryFn: () => listFn({ data: undefined as unknown as never }),
    enabled: unlocked,
  });

  const selectedUser = useMemo(
    () => (users as ManagedUser[]).find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  const saveMut = useMutation({
    mutationFn: async (args: { user: ManagedUser; page_key: string; enabled: boolean }) => {
      const base = MANAGED_PAGES.map((p) => {
        const cur = args.user.permissions.find((x) => x.page_key === p.key);
        return {
          page_key: p.key,
          can_view: cur?.can_view ?? false,
          can_edit: cur?.can_edit ?? false,
        };
      });
      const merged = base.map((row) =>
        row.page_key === args.page_key
          ? {
              ...row,
              can_view: args.enabled,
              can_edit: args.enabled ? row.can_edit : false,
            }
          : row,
      );
      // Preserve entries the user already had but not present in MANAGED_PAGES
      for (const p of args.user.permissions) {
        if (!merged.some((m) => m.page_key === p.page_key)) merged.push(p);
      }
      return setPermFn({ data: { user_id: args.user.id, permissions: merged } });
    },
    onSuccess: () => {
      toast.success("Módulo atualizado");
      qc.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tryUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === MASTER_PASSWORD) {
      setUnlocked(true);
      sessionStorage.setItem(UNLOCK_KEY, "1");
      setPassword("");
      toast.success("Módulos desbloqueados nesta sessão");
    } else {
      toast.error("Senha master incorreta");
    }
  };

  const lock = () => {
    setUnlocked(false);
    sessionStorage.removeItem(UNLOCK_KEY);
    setSelectedUserId("");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Módulos por usuário
        </CardTitle>
        {unlocked && (
          <Button variant="ghost" size="sm" onClick={lock}>
            <Lock className="mr-1 h-3.5 w-3.5" /> Bloquear
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!unlocked ? (
          <form onSubmit={tryUnlock} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Área restrita. Informe a senha master do desenvolvedor para liberar/bloquear módulos por usuário.
            </p>
            <div className="space-y-1.5">
              <Label>Senha master</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                placeholder="••••••••"
              />
            </div>
            <Button type="submit">
              <LockOpen className="mr-2 h-4 w-4" /> Desbloquear
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Usuário</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {(users as ManagedUser[]).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome || u.email}
                      {u.roles.length > 0 ? ` — ${u.roles.join(", ")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedUser ? (
              <div className="space-y-1 rounded-md border p-2">
                {selectedUser.roles.includes("admin") && (
                  <p className="mb-2 px-2 text-xs text-amber-600">
                    Este usuário é admin — o papel admin ignora bloqueios por módulo.
                  </p>
                )}
                {MANAGED_PAGES.map((p) => {
                  const cur = selectedUser.permissions.find((x) => x.page_key === p.key);
                  const enabled = cur?.can_view ?? false;
                  return (
                    <div
                      key={p.key}
                      className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/50"
                    >
                      <span className="text-sm">{p.label}</span>
                      <Switch
                        checked={enabled}
                        disabled={saveMut.isPending}
                        onCheckedChange={(v) =>
                          saveMut.mutate({ user: selectedUser, page_key: p.key, enabled: !!v })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecione um usuário para configurar os módulos liberados.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
