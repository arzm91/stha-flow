import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verifyOwnerAdminPassword } from "@/lib/security/verify-admin.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

type Pending = {
  reason?: string;
  resolve: (ok: boolean) => void;
};

let openRequest: ((reason?: string) => Promise<boolean>) | null = null;

/**
 * Imperative API — call from any handler. Resolves true if the admin password
 * was confirmed, false if cancelled or wrong. The gate dialog is mounted once
 * inside AdminPasswordGate.
 *
 * Usage:
 *   if (!(await requireAdminPassword("excluir este registro"))) return;
 */
export async function requireAdminPassword(reason?: string): Promise<boolean> {
  if (!openRequest) {
    console.warn("AdminPasswordGate not mounted");
    return false;
  }
  return openRequest(reason);
}

export function AdminPasswordGate() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verify = useServerFn(verifyOwnerAdminPassword);

  useEffect(() => {
    openRequest = (reason) =>
      new Promise<boolean>((resolve) => {
        setPassword("");
        setError(null);
        setPending({ reason, resolve });
      });
    return () => {
      openRequest = null;
    };
  }, []);

  function close(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
    setPassword("");
    setError(null);
    setSubmitting(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await verify({ data: { password } });
      if (res.ok) close(true);
      else {
        setError("Senha incorreta");
        setSubmitting(false);
      }
    } catch (err) {
      setError((err as Error).message || "Falha ao verificar");
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(o) => {
        if (!o && pending) close(false);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Confirmação de administrador
          </DialogTitle>
          <DialogDescription>
            {pending?.reason
              ? `Para ${pending.reason}, informe a senha do administrador.`
              : "Informe a senha do administrador para continuar."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Senha do administrador</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              required
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !password}>
              {submitting ? "Verificando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
