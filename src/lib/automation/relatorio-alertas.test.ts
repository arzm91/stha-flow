import { describe, it, expect } from "vitest";
import { montarRelatorioAlertas, fmtDuracao } from "./relatorio-alertas";

describe("relatório de alertas agendado", () => {
  const rows = [
    { alerta_nome: "A", severidade: "critical", status: "resolvido", created_at: "2026-11-23T10:00:00Z", resolvido_em: "2026-11-23T10:05:00Z" },
    { alerta_nome: "A", severidade: "warning", status: "aberto", created_at: "2026-11-23T09:00:00Z", resolvido_em: null },
    { alerta_nome: "B", severidade: "warning", status: "resolvido", created_at: "2026-11-23T08:00:00Z", resolvido_em: "2026-11-23T09:30:00Z" },
  ];
  const r = montarRelatorioAlertas(rows, new Date("2026-11-22T11:00:00Z"), new Date("2026-11-23T11:00:00Z"), 24);
  it("conta totais por nível", () => {
    expect([r.total, r.criticos, r.atencao, r.ativos]).toEqual([3, 1, 2, 1]);
  });
  it("ordena mais recorrentes", () => {
    expect(r.top[0]).toEqual({ nome: "A", qtd: 2 });
  });
  it("calcula duração", () => {
    expect(r.linhas[0]?.duracao).toBe("5 min");
    expect(r.linhas[1]?.duracao).toBe("ativo");
    expect(fmtDuracao(90 * 60000)).toBe("1h 30min");
  });
});
