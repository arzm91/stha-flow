import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { listSchedules, upsertSchedule, deleteSchedule } from '@/lib/reports/reports.functions'
import { listAccountUsers } from '@/lib/permissions/list-users.functions'
import { Trash2, Plus, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'

const DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

export function SchedulesDialog({ open, onOpenChange, reportId }: {
  open: boolean; onOpenChange: (v: boolean) => void; reportId: string
}) {
  const qc = useQueryClient()
  const listFn = useServerFn(listSchedules)
  const upsertFn = useServerFn(upsertSchedule)
  const deleteFn = useServerFn(deleteSchedule)
  const listUsers = useServerFn(listAccountUsers)

  const { data: schedules = [] } = useQuery({
    queryKey: ['report-schedules', reportId],
    queryFn: () => listFn({ data: { report_id: reportId } }),
    enabled: open,
  })
  const { data: users = [] } = useQuery({
    queryKey: ['account-users'],
    queryFn: () => listUsers(),
    enabled: open,
  })

  const [editing, setEditing] = useState<any | null>(null)

  const save = useMutation({
    mutationFn: (input: any) => upsertFn({ data: input }),
    onSuccess: () => {
      toast.success('Agenda salva')
      qc.invalidateQueries({ queryKey: ['report-schedules', reportId] })
      setEditing(null)
    },
    onError: (e: any) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success('Removida'); qc.invalidateQueries({ queryKey: ['report-schedules', reportId] }) },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5" />Agendas de envio</DialogTitle></DialogHeader>

        {!editing ? (
          <div className="space-y-2">
            <Button size="sm" onClick={() => setEditing({
              report_id: reportId, nome: 'Nova agenda', ativo: true,
              frequencia: 'diaria', hora: '08:00', dias_semana: [1,2,3,4,5],
              recipient_user_ids: [], email_template_key: 'report-ready',
            })}><Plus className="w-4 h-4 mr-1" />Nova agenda</Button>
            {schedules.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">Nenhuma agenda configurada.</div>}
            {schedules.map((s: any) => (
              <div key={s.id} className="border rounded p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{s.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.frequencia} · {s.hora?.slice(0,5)} · {(s.recipient_user_ids ?? []).length} destinatário(s) {s.ativo ? '' : '(inativa)'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(s)}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={editing.nome} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} /></div>
            <div className="flex items-center justify-between"><Label>Ativa</Label><Switch checked={editing.ativo} onCheckedChange={(v) => setEditing({ ...editing, ativo: v })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequência</Label>
                <Select value={editing.frequencia} onValueChange={(v) => setEditing({ ...editing, frequencia: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diaria">Diária</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Horário</Label><Input type="time" value={editing.hora?.slice(0,5) ?? '08:00'} onChange={(e) => setEditing({ ...editing, hora: e.target.value })} /></div>
            </div>
            {editing.frequencia !== 'mensal' && (
              <div>
                <Label>Dias da semana</Label>
                <div className="flex gap-1 mt-1">
                  {DAYS.map((d, i) => (
                    <button key={i} type="button"
                      className={`w-9 h-9 rounded text-xs border ${editing.dias_semana.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background'}`}
                      onClick={() => {
                        const set = new Set(editing.dias_semana)
                        set.has(i) ? set.delete(i) : set.add(i)
                        setEditing({ ...editing, dias_semana: [...set].sort() })
                      }}>{d}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Destinatários</Label>
              <div className="border rounded max-h-40 overflow-auto p-2 space-y-1">
                {users.map((u: any) => {
                  const on = editing.recipient_user_ids.includes(u.id)
                  return (
                    <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted px-2 py-1 rounded">
                      <input type="checkbox" checked={on} onChange={(e) => {
                        const set = new Set(editing.recipient_user_ids)
                        e.target.checked ? set.add(u.id) : set.delete(u.id)
                        setEditing({ ...editing, recipient_user_ids: [...set] })
                      }} />
                      <span>{u.nome || u.email}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </label>
                  )
                })}
                {users.length === 0 && <div className="text-xs text-muted-foreground">Nenhum usuário disponível</div>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={() => save.mutate(editing)} disabled={save.isPending}>Salvar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
