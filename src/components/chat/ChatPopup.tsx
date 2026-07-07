import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, X, ArrowLeft, Send, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Profile = { id: string; nome: string; email: string | null; empresa: string | null };
type ChatMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};

export function ChatPopup() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeContact, setActiveContact] = useState<Profile | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(open);
  const activeRef = useRef<Profile | null>(null);

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { activeRef.current = activeContact; }, [activeContact]);

  // Load current user, contacts, and all messages involving me
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid || cancelled) return;
      setMe(uid);

      const [{ data: profs }, { data: msgs }] = await Promise.all([
        supabase.from("profiles").select("id,nome,email,empresa").neq("id", uid).order("nome"),
        supabase
          .from("chat_messages")
          .select("*")
          .or(`sender_id.eq.${uid},recipient_id.eq.${uid}`)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setContacts((profs ?? []) as Profile[]);
      setMessages((msgs ?? []) as ChatMessage[]);
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel(`chat:${me}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const m = payload.new as ChatMessage;
          if (m.sender_id !== me && m.recipient_id !== me) return;
          setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
          if (m.recipient_id === me) {
            const sender = contacts.find((c) => c.id === m.sender_id);
            const isViewing = openRef.current && activeRef.current?.id === m.sender_id;
            if (!isViewing) {
              toast.message(`Nova mensagem de ${sender?.nome ?? "usuário"}`, {
                description: m.content.slice(0, 120),
                action: {
                  label: "Abrir",
                  onClick: () => {
                    setOpen(true);
                    if (sender) setActiveContact(sender);
                  },
                },
              });
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages" },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) => prev.map((p) => (p.id === m.id ? m : p)));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [me, contacts]);

  // Mark as read when viewing conversation
  useEffect(() => {
    if (!open || !activeContact || !me) return;
    const unread = messages.filter(
      (m) => m.sender_id === activeContact.id && m.recipient_id === me && !m.read_at,
    );
    if (unread.length === 0) return;
    const ids = unread.map((m) => m.id);
    supabase
      .from("chat_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids)
      .then(({ error }) => {
        if (!error) {
          setMessages((prev) =>
            prev.map((m) => (ids.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m)),
          );
        }
      });
  }, [open, activeContact, messages, me]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeContact, open]);

  const unreadTotal = useMemo(
    () => messages.filter((m) => m.recipient_id === me && !m.read_at).length,
    [messages, me],
  );

  const unreadByContact = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of messages) {
      if (m.recipient_id === me && !m.read_at) {
        map.set(m.sender_id, (map.get(m.sender_id) ?? 0) + 1);
      }
    }
    return map;
  }, [messages, me]);

  const lastByContact = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) {
      const other = m.sender_id === me ? m.recipient_id : m.sender_id;
      const prev = map.get(other);
      if (!prev || new Date(m.created_at) > new Date(prev.created_at)) map.set(other, m);
    }
    return map;
  }, [messages, me]);

  const conversation = useMemo(() => {
    if (!activeContact || !me) return [];
    return messages.filter(
      (m) =>
        (m.sender_id === me && m.recipient_id === activeContact.id) ||
        (m.sender_id === activeContact.id && m.recipient_id === me),
    );
  }, [messages, activeContact, me]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...contacts].sort((a, b) => {
      const la = lastByContact.get(a.id)?.created_at ?? "";
      const lb = lastByContact.get(b.id)?.created_at ?? "";
      if (la && lb) return lb.localeCompare(la);
      if (la) return -1;
      if (lb) return 1;
      return a.nome.localeCompare(b.nome);
    });
    if (!q) return sorted;
    return sorted.filter(
      (c) => c.nome.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q),
    );
  }, [contacts, search, lastByContact]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeContact || !me) return;
    setDraft("");
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ sender_id: me, recipient_id: activeContact.id, content: text })
      .select()
      .single();
    if (error) {
      toast.error("Falha ao enviar mensagem");
      setDraft(text);
      return;
    }
    if (data) setMessages((prev) => (prev.some((p) => p.id === data.id) ? prev : [...prev, data as ChatMessage]));
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen((v) => !v)}
        aria-label="Abrir chat"
        title="Chat"
      >
        <MessageCircle className="h-4 w-4" />
        {unreadTotal > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unreadTotal > 9 ? "9+" : unreadTotal}
          </span>
        )}
      </Button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-x-2 bottom-2 z-[9999] flex h-[min(80vh,560px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom-4 sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[520px] sm:w-[360px]">

          <div className="flex h-12 items-center gap-2 border-b border-border bg-card px-3">
            {activeContact ? (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setActiveContact(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-semibold">{activeContact.nome}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{activeContact.email}</span>
                </div>
              </>
            ) : (
              <>
                <MessageCircle className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Mensagens</span>
              </>
            )}
            <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {!activeContact ? (
            <>
              <div className="border-b border-border p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar contato..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 pl-7 text-sm"
                  />
                </div>
              </div>
              <ScrollArea className="flex-1">
                {filteredContacts.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredContacts.map((c) => {
                      const unread = unreadByContact.get(c.id) ?? 0;
                      const last = lastByContact.get(c.id);
                      return (
                        <li key={c.id}>
                          <button
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent"
                            onClick={() => setActiveContact(c)}
                          >
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                              {c.nome.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium">{c.nome}</span>
                                {unread > 0 && (
                                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                                    {unread}
                                  </span>
                                )}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {last
                                  ? `${last.sender_id === me ? "Você: " : ""}${last.content}`
                                  : c.email ?? "Sem conversas"}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                {conversation.length === 0 ? (
                  <div className="pt-10 text-center text-sm text-muted-foreground">
                    Envie a primeira mensagem para {activeContact.nome}.
                  </div>
                ) : (
                  conversation.map((m) => {
                    const mine = m.sender_id === me;
                    return (
                      <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-3 py-1.5 text-sm break-words",
                            mine
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted text-foreground rounded-bl-sm",
                          )}
                        >
                          <div className="whitespace-pre-wrap">{m.content}</div>
                          <div
                            className={cn(
                              "mt-0.5 text-[10px] opacity-70",
                              mine ? "text-right" : "text-left",
                            )}
                          >
                            {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <form
                className="flex items-center gap-2 border-t border-border bg-card p-2"
                onSubmit={(e) => { e.preventDefault(); send(); }}
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escreva uma mensagem..."
                  className="h-9 text-sm"
                  autoFocus
                />
                <Button type="submit" size="icon" className="h-9 w-9" disabled={!draft.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
