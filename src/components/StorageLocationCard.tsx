import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { History, Container, Package, Warehouse, Cylinder, SlidersHorizontal, FlaskConical } from "lucide-react";
import { Badge } from "./ui/badge";
import { formatNumber } from "@/lib/format";

export type StorageLocation = {
  id: string;
  codigo: string;
  nome: string;
  tipo?: string | null;
  capacidade?: number | string | null;
  unidade?: string | null;
  tag_nivel_nome?: string | null;
  tag_nivel_modo?: string | null;
  cor?: string | null;
  produto_id?: string | null;
};

type TagLive = { nome: string; valor_num: number | null; valor: string | null; unidade: string | null };

export type LatestAnalise = {
  nome: string | null;
  resultado: number;
  unidade: string | null;
  valor_min: number | null;
  valor_max: number | null;
  registrado_em: string;
};

function pctSaldo(saldo: number, cap?: number | string | null): number | null {
  const c = cap == null ? NaN : Number(cap);
  if (!c || c <= 0) return null;
  return Math.max(0, Math.min(100, (saldo / c) * 100));
}

function pctTag(loc: StorageLocation, tagVal: number | null): number | null {
  if (tagVal == null) return null;
  if ((loc.tag_nivel_modo ?? "percent") === "percent") {
    return Math.max(0, Math.min(100, tagVal));
  }
  return pctSaldo(tagVal, loc.capacidade);
}

export function StorageLocationCard({
  loc, saldo, tag, latestAnalise, onAdjust,
}: {
  loc: StorageLocation;
  saldo: number;
  tag?: TagLive | null;
  latestAnalise?: LatestAnalise | null;
  onAdjust?: () => void;
}) {
  const tipo = (loc.tipo as string) || "tanque";
  const cor = loc.cor || undefined;
  const saldoPct = pctSaldo(saldo, loc.capacidade);
  const tagVal = tag?.valor_num != null ? Number(tag.valor_num) : null;
  const tagPctVal = pctTag(loc, tagVal);

  const analiseFora = latestAnalise
    ? (latestAnalise.valor_min != null && latestAnalise.resultado < latestAnalise.valor_min) ||
      (latestAnalise.valor_max != null && latestAnalise.resultado > latestAnalise.valor_max)
    : false;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-xs text-muted-foreground">{loc.codigo}</div>
            <div className="truncate text-base font-semibold">{loc.nome}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {TIPO_LABEL[tipo] ?? tipo}
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {onAdjust && (
              <Button variant="ghost" size="icon" title="Ajustar saldo / produto / análises" onClick={onAdjust}>
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            )}
            <Button asChild variant="ghost" size="icon" title="Histórico">
              <Link to="/estoque/tanques/$id" params={{ id: loc.id }}><History className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>

        {tipo === "tanque" || tipo === "container" ? (
          <DualLevelVisual
            tipo={tipo}
            cor={cor}
            saldo={saldo}
            saldoPct={saldoPct}
            tag={tag}
            tagPct={tagPctVal}
            tagModo={loc.tag_nivel_modo ?? "percent"}
            unidade={loc.unidade}
            capacidade={loc.capacidade}
            hasTag={!!loc.tag_nivel_nome}
          />
        ) : tipo === "pallet" ? (
          <PalletVisual cor={cor} saldo={saldo} unidade={loc.unidade} capacidade={loc.capacidade}
            tag={tag} hasTag={!!loc.tag_nivel_nome} />
        ) : (
          <GenericVisual cor={cor} saldo={saldo} unidade={loc.unidade} capacidade={loc.capacidade}
            tag={tag} hasTag={!!loc.tag_nivel_nome} />
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="uppercase tracking-wide">Ocupação</span>
            <span className="font-mono text-foreground">{saldoPct != null ? `${saldoPct.toFixed(1)}%` : "—"}</span>
          </div>
          {latestAnalise ? (
            <div className="flex items-center gap-1">
              <FlaskConical className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[9rem] truncate text-muted-foreground">{latestAnalise.nome ?? "Análise"}</span>
              <span className="font-mono">{formatNumber(latestAnalise.resultado)}{latestAnalise.unidade ? ` ${latestAnalise.unidade}` : ""}</span>
              {(latestAnalise.valor_min != null || latestAnalise.valor_max != null) && (
                <Badge variant="outline" className={
                  analiseFora
                    ? "h-4 px-1 text-[10px] bg-destructive/20 text-destructive border-destructive/30"
                    : "h-4 px-1 text-[10px] bg-success/20 text-success border-success/30"
                }>{analiseFora ? "Fora" : "Ok"}</Badge>
              )}
            </div>
          ) : (
            <span className="italic text-muted-foreground">Sem análise</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const TIPO_LABEL: Record<string, string> = {
  tanque: "Tanque",
  container: "Container",
  pallet: "Pallet",
  generico: "Local físico",
};

function DualLevelVisual({
  tipo, cor, saldo, saldoPct, tag, tagPct, tagModo, unidade, capacidade, hasTag,
}: {
  tipo: string; cor?: string; saldo: number; saldoPct: number | null;
  tag?: TagLive | null; tagPct: number | null; tagModo: string;
  unidade?: string | null; capacidade?: number | string | null; hasTag: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <LevelShape label="Saldo" pct={saldoPct} cor={cor} tipo={tipo}
        valueText={`${formatNumber(saldo)}${unidade ? ` ${unidade}` : ""}`}
        subText={capacidade ? `de ${formatNumber(Number(capacidade))}${unidade ? ` ${unidade}` : ""}` : ""}
      />
      {hasTag ? (
        <LevelShape label="Tag" pct={tagPct} cor={cor ? shade(cor) : "var(--accent)"} tipo={tipo}
          valueText={tag?.valor_num != null
            ? `${formatNumber(Number(tag.valor_num))}${tagModo === "percent" ? "%" : (tag.unidade ? ` ${tag.unidade}` : "")}`
            : "—"}
          subText={tag?.nome ? tag.nome : "sem leitura"}
        />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
          Configure uma tag de nível no cadastro do local para comparar com o saldo.
        </div>
      )}
    </div>
  );
}

function LevelShape({
  tipo, pct, cor, label, valueText, subText,
}: { tipo: string; pct: number | null; cor?: string; label: string; valueText: string; subText: string }) {
  const fillColor = cor || "var(--primary)";
  const p = pct == null ? 0 : pct;
  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <svg viewBox="0 0 80 110" className="h-28 w-full max-w-[100px]">
        {tipo === "tanque" ? (
          <>
            <ellipse cx="40" cy="14" rx="28" ry="8" fill="hsl(var(--muted))" stroke="hsl(var(--border))" />
            <rect x="12" y="14" width="56" height="80" fill="hsl(var(--muted))" stroke="hsl(var(--border))" />
            <ellipse cx="40" cy="94" rx="28" ry="8" fill="hsl(var(--muted))" stroke="hsl(var(--border))" />
            <clipPath id={`clip-${label}-${cor}`}>
              <rect x="12" y="14" width="56" height="80" />
            </clipPath>
            <g clipPath={`url(#clip-${label}-${cor})`}>
              <rect x="12" y={14 + (80 * (100 - p) / 100)} width="56" height={(80 * p) / 100} fill={fillColor} opacity="0.85" />
            </g>
            <ellipse cx="40" cy="14" rx="28" ry="8" fill="none" stroke="hsl(var(--border))" />
          </>
        ) : (
          <>
            <rect x="14" y="10" width="52" height="90" rx="4" fill="hsl(var(--muted))" stroke="hsl(var(--border))" />
            <clipPath id={`clip-${label}-${cor}`}>
              <rect x="14" y="10" width="52" height="90" rx="4" />
            </clipPath>
            <g clipPath={`url(#clip-${label}-${cor})`}>
              <rect x="14" y={10 + (90 * (100 - p) / 100)} width="52" height={(90 * p) / 100} fill={fillColor} opacity="0.85" />
            </g>
            <rect x="14" y="10" width="52" height="90" rx="4" fill="none" stroke="hsl(var(--border))" />
          </>
        )}
      </svg>
      <div className="mt-1 text-center">
        <div className="font-mono text-sm font-semibold">{valueText}</div>
        <div className="text-[10px] text-muted-foreground">{pct != null ? `${p.toFixed(0)}% — ` : ""}{subText}</div>
      </div>
    </div>
  );
}

function PalletVisual({
  cor, saldo, unidade, capacidade, tag, hasTag,
}: { cor?: string; saldo: number; unidade?: string | null; capacidade?: number | string | null; tag?: TagLive | null; hasTag: boolean }) {
  const fill = cor || "var(--primary)";
  const cap = capacidade ? Number(capacidade) : null;
  const layers = Math.max(1, Math.min(6, Math.round((saldo / Math.max(1, (cap ?? saldo) || 1)) * 6) || 1));
  return (
    <div className="grid grid-cols-2 gap-3 items-center">
      <div className="flex flex-col items-center">
        <Package className="h-6 w-6 text-muted-foreground" />
        <svg viewBox="0 0 80 90" className="h-28 w-full max-w-[100px]">
          {Array.from({ length: layers }).map((_, i) => (
            <rect key={i} x="10" y={70 - i * 11} width="60" height="9" rx="1.5"
              fill={fill} opacity={0.5 + i * 0.08} stroke="hsl(var(--border))" />
          ))}
          {/* base pallet */}
          <rect x="6" y="80" width="68" height="6" fill="hsl(var(--muted-foreground))" opacity="0.4" />
          <rect x="8" y="86" width="8" height="3" fill="hsl(var(--muted-foreground))" opacity="0.4" />
          <rect x="36" y="86" width="8" height="3" fill="hsl(var(--muted-foreground))" opacity="0.4" />
          <rect x="64" y="86" width="8" height="3" fill="hsl(var(--muted-foreground))" opacity="0.4" />
        </svg>
        <div className="text-center">
          <div className="font-mono text-sm font-semibold">{formatNumber(saldo)}{unidade ? ` ${unidade}` : " un"}</div>
          <div className="text-[10px] text-muted-foreground">{cap ? `cap ${formatNumber(cap)}` : "sem capacidade"}</div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center text-center">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Tag</div>
        {hasTag ? (
          <>
            <div className="font-mono text-lg font-semibold">
              {tag?.valor_num != null ? formatNumber(Number(tag.valor_num)) : "—"}
              {tag?.unidade ? <span className="ml-1 text-xs text-muted-foreground">{tag.unidade}</span> : null}
            </div>
            <div className="text-[10px] text-muted-foreground">{tag?.nome ?? "sem leitura"}</div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Configure uma tag para leitura externa.</div>
        )}
      </div>
    </div>
  );
}

function GenericVisual({
  cor, saldo, unidade, capacidade, tag, hasTag,
}: { cor?: string; saldo: number; unidade?: string | null; capacidade?: number | string | null; tag?: TagLive | null; hasTag: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 items-center">
      <div className="flex flex-col items-center">
        <Warehouse className="h-10 w-10" style={{ color: cor || "var(--primary)" }} />
        <div className="mt-2 text-center">
          <div className="font-mono text-lg font-semibold text-primary">{formatNumber(saldo)}{unidade ? ` ${unidade}` : ""}</div>
          <div className="text-[10px] text-muted-foreground">{capacidade ? `cap ${formatNumber(Number(capacidade))}${unidade ? ` ${unidade}` : ""}` : "—"}</div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center text-center">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Tag</div>
        {hasTag ? (
          <>
            <div className="font-mono text-lg font-semibold">
              {tag?.valor_num != null ? formatNumber(Number(tag.valor_num)) : "—"}
              {tag?.unidade ? <span className="ml-1 text-xs text-muted-foreground">{tag.unidade}</span> : null}
            </div>
            <div className="text-[10px] text-muted-foreground">{tag?.nome ?? "sem leitura"}</div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Sem tag configurada.</div>
        )}
      </div>
    </div>
  );
}

// silence unused import warnings (lucide icons used conditionally)
void Container; void Cylinder;

function shade(hex: string): string {
  // simple lighten for the secondary fill — fallback to original if not hex
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex.replace("#", ""))) return hex;
  const h = hex.replace("#", "");
  const r = Math.min(255, parseInt(h.slice(0, 2), 16) + 40);
  const g = Math.min(255, parseInt(h.slice(2, 4), 16) + 40);
  const b = Math.min(255, parseInt(h.slice(4, 6), 16) + 40);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
