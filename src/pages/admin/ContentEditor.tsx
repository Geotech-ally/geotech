import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService, type ContentTable, type Row } from '../../services/adminService'
type Kind = 'text' | 'area' | 'list' | 'bool'
const CFG: Record<ContentTable, { label: string; title: string; fields: [string, string, Kind][] }> = {
  projects: { label: 'Projects', title: 'title', fields: [['title', 'Title', 'text'], ['slug', 'Slug (URL name)', 'text'], ['summary', 'Summary', 'area'], ['problem', 'Problem', 'area'], ['solution', 'Solution', 'area'], ['result', 'Result', 'area'], ['technologies', 'Technologies (comma separated)', 'list'], ['is_published', 'Published', 'bool']] },
  testimonials: { label: 'Testimonials', title: 'author', fields: [['author', 'Author', 'text'], ['role', 'Role or company', 'text'], ['quote', 'Quote', 'area'], ['is_published', 'Published', 'bool']] },
  blog_posts: { label: 'Blog posts', title: 'title', fields: [['title', 'Title', 'text'], ['slug', 'Slug (URL name)', 'text'], ['excerpt', 'Excerpt', 'area'], ['body', 'Body (blank line between paragraphs)', 'area'], ['is_published', 'Published', 'bool']] },
}
const c = 'mt-1 w-full rounded border border-line bg-surface px-2 py-1'
export default function ContentEditor() {
  const t = (useParams().table ?? '') as ContentTable, cfg = CFG[t], qc = useQueryClient(), [edit, setEdit] = useState<Row | null>(null)
  useEffect(() => setEdit(null), [t])
  const q = useQuery({ queryKey: ['content', t], queryFn: () => adminService.contentList(t), enabled: !!cfg })
  const done = () => { setEdit(null); qc.invalidateQueries({ queryKey: ['content', t] }); qc.invalidateQueries({ queryKey: [t === 'blog_posts' ? 'posts' : t] }) }
  const save = useMutation({ mutationFn: (r: Row) => adminService.contentSave(t, r), onSuccess: done })
  const del = useMutation({ mutationFn: (id: string) => adminService.contentDelete(t, id), onSuccess: done })
  if (!cfg) return <p className="mt-6">Unknown section.</p>
  const set = (k: string, v: Row[string]) => setEdit(e => ({ ...e, [k]: v }))
  return (<div className="mt-6"><div className="flex items-center gap-4"><h1 className="text-3xl font-bold">{cfg.label}</h1><button className="cursor-pointer underline" onClick={() => setEdit({})}>New</button></div>
    {q.isPending && <p role="status" className="mt-4 text-muted">Loading {cfg.label.toLowerCase()}…</p>}
    {q.isError && <p role="alert" className="mt-4 text-red-600">{q.error instanceof Error ? q.error.message : 'Could not load this list. Refresh to try again.'}</p>}{q.data?.length === 0 && !q.isError && !edit && <p className="mt-4 text-muted">Nothing here yet. Choose New to add one.</p>}
    {del.isError && <p role="alert" className="mt-4 text-red-600 dark:text-red-400">{del.error instanceof Error ? del.error.message : 'Could not delete.'}</p>}
    <ul className="mt-4 divide-y divide-line rounded border border-line bg-surface">{q.data?.map(r => <li key={String(r.id)} className="flex items-center gap-3 p-3"><span className="flex-1">{String(r[cfg.title])}{!r.is_published && <span className="ml-2 text-sm text-muted">draft</span>}</span>
      <button className="cursor-pointer underline" onClick={() => setEdit(r)}>Edit</button><button className="cursor-pointer underline" onClick={() => confirm('Delete this item?') && del.mutate(String(r.id))}>Delete</button></li>)}</ul>
    {edit && <form className="mt-6 grid gap-3 rounded border border-line bg-surface p-5" onSubmit={e => { e.preventDefault(); const r = { ...edit }; for (const [k, , kind] of cfg.fields) if (kind === 'list') r[k] = ((r[k] as string[]) ?? []).map(s => s.trim()).filter(Boolean); save.mutate(r) }}>
      {cfg.fields.map(([k, label, kind]) => kind === 'bool' ? <label key={k} className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={!!edit[k]} onChange={e => set(k, e.target.checked)}/>{label}</label>
        : <label key={k} className="font-semibold">{label}{kind === 'area' ? <textarea rows={4} className={c} value={String(edit[k] ?? '')} onChange={e => set(k, e.target.value)} required={k === 'summary' || k === 'quote' || (k === 'body' && !!edit.is_published)}/>
          : <input className={c} required={kind === 'text' && k !== 'role'} value={kind === 'list' ? ((edit[k] as string[]) ?? []).join(', ') : String(edit[k] ?? '')} onChange={e => set(k, kind === 'list' ? e.target.value.split(',') : e.target.value)}/>}</label>)}
      {save.isError && <p role="alert" className="text-red-600 dark:text-red-400">{save.error instanceof Error ? save.error.message : 'Could not save.'}</p>}
      <div className="flex gap-4"><button disabled={save.isPending} className="cursor-pointer rounded bg-accent px-5 py-2 font-semibold text-white dark:text-[#12131c]">{save.isPending ? 'Saving…' : 'Save'}</button><button type="button" className="cursor-pointer underline" onClick={() => setEdit(null)}>Cancel</button></div></form>}</div>)
}
