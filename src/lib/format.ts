export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatNumber(n: number | null | undefined, digits = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatInt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("pt-BR");
}

export function durationFromNow(start: string | Date): string {
  return formatDuration(new Date().getTime() - new Date(start).getTime());
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function durationBetween(start: string | Date, end: string | Date): string {
  return formatDuration(new Date(end).getTime() - new Date(start).getTime());
}

export function formatRelative(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 5) return "agora";
  if (diffSec < 60) return `há ${diffSec}s`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const days = Math.floor(h / 24);
  return `há ${days}d`;
}

