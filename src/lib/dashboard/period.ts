export type DashboardPeriodKey = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

export type DashboardPeriod = {
  key: DashboardPeriodKey;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  label: string;
  days: number;
};

export type DashboardFilters = {
  equipamentoId?: string;
  produtoId?: string;
};

const APP_TIME_ZONE = "America/Sao_Paulo";

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function saoPauloMidnight(year: number, month: number, day: number) {
  // São Paulo no período atual usa UTC-3. Mantemos o limite operacional estável
  // e independente do fuso configurado no dispositivo do usuário.
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00-03:00`);
}

function shiftDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

export function resolveDashboardPeriod(
  key: DashboardPeriodKey,
  customStart?: string,
  customEnd?: string,
  now = new Date(),
): DashboardPeriod {
  const parts = zonedParts(now);
  const today = saoPauloMidnight(parts.year, parts.month, parts.day);
  let start = today;
  let end = shiftDays(today, 1);
  let label = "Hoje";

  if (key === "yesterday") {
    start = shiftDays(today, -1);
    end = today;
    label = "Ontem";
  } else if (key === "7d") {
    start = shiftDays(today, -6);
    label = "Últimos 7 dias";
  } else if (key === "30d") {
    start = shiftDays(today, -29);
    label = "Últimos 30 dias";
  } else if (key === "month") {
    start = saoPauloMidnight(parts.year, parts.month, 1);
    label = "Mês atual";
  } else if (key === "custom" && customStart && customEnd) {
    start = new Date(`${customStart}T00:00:00-03:00`);
    end = new Date(`${customEnd}T00:00:00-03:00`);
    end = shiftDays(end, 1);
    label = `${new Date(start).toLocaleDateString("pt-BR")} – ${shiftDays(end, -1).toLocaleDateString("pt-BR")}`;
  }

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    start = today;
    end = shiftDays(today, 1);
    label = "Hoje";
  }

  const duration = end.getTime() - start.getTime();
  return {
    key,
    start: start.toISOString(),
    end: end.toISOString(),
    previousStart: new Date(start.getTime() - duration).toISOString(),
    previousEnd: start.toISOString(),
    label,
    days: Math.max(1, Math.round(duration / 86_400_000)),
  };
}