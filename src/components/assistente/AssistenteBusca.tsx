import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Loader2, Send } from "lucide-react";
import { askAssistente } from "@/lib/assistente/ask.functions";

const SUGESTOES = [
  "Qual é a temperatura do reator?",
  "Quanto produziu nos últimos 7 dias?",
  "Quais ordens estão em produção agora?",
  "Tem alertas ativos?",
];

export function AssistenteBusca() {
  const [open, setOpen] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [loading, setLoading] = useState(false);
  const [resposta, setResposta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ultima, setUltima] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ask = useServerFn(askAssistente);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const enviar = async (texto?: string) => {
    const q = (texto ?? pergunta).trim();
    if (q.length < 2 || loading) return;
    setLoading(true);
    setErro(null);
    setResposta(null);
    setUltima(q);
    setPergunta(q);
    try {
      const r = await ask({ data: { pergunta: q } });
      setResposta(r.resposta);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível consultar agora.");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Assistente de busca"
        title="Assistente de busca (Ctrl+K)"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">Assistente de busca</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
            className="flex items-center gap-2"
          >
            <Input
              ref={inputRef}
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              placeholder="Pergunte algo sobre tags, produção, ordens ou alertas..."
              maxLength={500}
            />
            <Button type="submit" size="icon" disabled={loading || pergunta.trim().length < 2}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>

          {!resposta && !loading && !erro && (
            <div className="flex flex-wrap gap-2 pt-1">
              {SUGESTOES.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs font-normal"
                  onClick={() => void enviar(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          )}

          {(loading || resposta || erro) && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              {ultima && <p className="mb-2 text-xs text-muted-foreground">“{ultima}”</p>}
              {loading && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Consultando o sistema...
                </p>
              )}
              {erro && <p className="text-destructive">{erro}</p>}
              {resposta && <p className="whitespace-pre-wrap leading-relaxed">{resposta}</p>}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            As respostas usam os dados atuais do seu sistema (tags ao vivo, produção, ordens e alertas).
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
