import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Thread from './Thread'
import { adminService, PRIORITIES, STATUSES, type Inquiry } from '../../services/adminService'
const f = 'rounded border border-line bg-surface px-2 py-1'
export default function Inquiries() {
  const qc = useQueryClient(), [status, setStatus] = useState(''), [sel, setSel] = useState<string>(''), [search, setSearch] = useState('')
  const q = useQuery({ queryKey: ['inquiries', status], queryFn: () => adminService.inquiries(status || undefined) })
  const upd = useMutation({ mutationFn: (v: { id: string; patch: Partial<Inquiry> }) => adminService.updateInquiry(v.id, v.patch), onSuccess: () => qc.invalidateQueries({ queryKey: ['inquiries'] }) })
  const rows = (q.data ?? []).filter(i => `${i.name} ${i.email} ${i.company_name ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const cur = rows.find(i => i.id === sel)
  return (<div className="mt-6 grid gap-6 lg:grid-cols-[2fr_3fr]"><div>
    <div className="flex flex-wrap gap-2"><input aria-label="Search inquiries" placeholder="Search name, email, company" className={`${f} flex-1`} value={search} onChange={e => setSearch(e.target.value)}/>
      <select aria-label="Filter by status" className={f} value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
    {q.isPending && <p role="status" className="mt-4">Loading…</p>}{q.isError && <p role="alert" className="mt-4 text-red-600">{q.error instanceof Error ? q.error.message : 'Could not load inquiries.'}</p>}
    {q.data && rows.length === 0 && <p className="mt-4 text-muted">No inquiries yet.</p>}
    <ul className="mt-3 divide-y divide-line rounded border border-line bg-surface">{rows.map(i => <li key={i.id}><button onClick={() => setSel(i.id)} aria-current={i.id === sel} className={`w-full cursor-pointer p-3 text-left ${i.id === sel ? 'bg-band' : ''}`}>
      <span className="font-semibold">{i.name}</span> <span className="text-sm text-muted">{i.status} · {i.priority}</span><br/><span className="text-sm text-muted">{new Date(i.created_at).toLocaleDateString()} · {i.email}</span></button></li>)}</ul></div>
    <div>{cur ? <article className="rounded border border-line bg-surface p-5"><h2 className="text-2xl font-bold">{cur.name}</h2>
      <p className="text-muted">{cur.company_name} · {cur.email}{cur.phone && ` · ${cur.phone}`}</p><p className="mt-3">{cur.project_description}</p>
      <p className="mt-2 text-sm text-muted">Budget: {cur.budget_range ?? '—'} · Timeline: {cur.timeline ?? '—'}</p>
      <div className="mt-4 flex gap-3"><label>Status <select className={f} value={cur.status} onChange={e => upd.mutate({ id: cur.id, patch: { status: e.target.value } })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Priority <select className={f} value={cur.priority} onChange={e => upd.mutate({ id: cur.id, patch: { priority: e.target.value } })}>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select></label></div>
      {upd.isError && <p role="alert" className="mt-2 text-sm text-red-600">Update failed. Please try again.</p>}
      <label className="mt-4 block">Private notes<textarea key={cur.id} className={`${f} mt-1 w-full`} rows={3} defaultValue={cur.admin_notes ?? ''} onBlur={e => e.target.value !== (cur.admin_notes ?? '') && upd.mutate({ id: cur.id, patch: { admin_notes: e.target.value } })}/></label>
      <Thread i={cur}/></article> : <p className="text-muted">Select an inquiry to review it.</p>}</div></div>)
}
