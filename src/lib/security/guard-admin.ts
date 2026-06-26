import { requireAdminPassword } from "@/components/admin-password/AdminPasswordGate";

export const ADMIN_CANCELLED = "__admin_cancelled__";

/**
 * Throws ADMIN_CANCELLED if the admin password modal is cancelled or wrong.
 * Wrap inside mutationFn or async handlers. Combine with isAdminCancelled in onError.
 */
export async function guardAdmin(reason: string): Promise<void> {
  const ok = await requireAdminPassword(reason);
  if (!ok) throw new Error(ADMIN_CANCELLED);
}

export function isAdminCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === ADMIN_CANCELLED;
}
