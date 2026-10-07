import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService, type Inquiry } from '../../services/adminService'
import { supabase } from '../../lib/supabase'
function AttachmentLink({ path }: { path: string }) {
  const q = useQuery({ queryKey: ['att', path], staleTime: 50 * 60_000, queryFn: async () => (await supabase.storage.from('attachments').createSignedUrl(path, 3600)).data?.signedUrl })
  return q.data ? <a className="text-sm underline" href={q.data} target="_blank" rel="noreferrer">Open attachment</a> : <span className="text-sm text-muted">Attachment…</span>
}
export default function Thread({ i }: { i: Inquiry }) {
  const qc = useQueryClient(), [text, setText] = useState(''), [file, setFile] = useState<File | null>(null)
  const conv = useQuery({ queryKey: ['conv', i.id], queryFn: () => adminService.conversation(i.id, `Project: ${i.name}`) }), cid = conv.data?.id
  const msgs = useQuery({ queryKey: ['msgs', cid], queryFn: () => adminService.messages(cid!), enabled: !!cid, refetchInterval: 15000 })
  const send = useMutation({ mutationFn: () => adminService.send(cid!, text.trim(), file), onSuccess: () => { setText(''); setFile(null); qc.invalidateQueries({ queryKey: ['msgs', cid] }) } })
  return (<section aria-label="Conversation" className="mt-6"><h3 className="text-lg font-bold">Conversation</h3>
    {conv.data && <label className="mt-1 block text-sm text-muted">Client link (send this to the client)<input readOnly className="mt-1 w-full rounded border border-line bg-surface px-2 py-1 text-ink" value={`${location.origin}/c/${conv.data.access_token}`} onFocus={e => e.target.select()}/></label>}
    <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">{msgs.data?.length === 0 && <li className="text-muted">No messages yet.</li>}
      {msgs.data?.map(m => <li key={m.id} className={`rounded p-2 ${m.sender_type === 'admin' ? 'bg-band' : 'border border-line'}`}><span className="text-xs text-muted">{m.sender_type} · {new Date(m.created_at).toLocaleString()}</span><p className="whitespace-pre-wrap">{m.message}</p>{m.attachment_path && <AttachmentLink path={m.attachment_path}/>}</li>)}</ul>
    <form className="mt-3 grid gap-2" onSubmit={e => { e.preventDefault(); if (text.trim()) send.mutate() }}>
      <input aria-label="Message" className="rounded border border-line bg-surface px-2 py-1" value={text} onChange={e => setText(e.target.value)}/>
      <input aria-label="Attach a file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" onChange={e => setFile(e.target.files?.[0] ?? null)}/>
      <button disabled={send.isPending || !cid} className="cursor-pointer justify-self-start rounded bg-accent px-4 py-1 font-semibold text-white dark:text-[#12131c]">{send.isPending ? 'Sending…' : 'Send'}</button></form>
    {send.isError && <p role="alert" className="mt-2 text-red-600 dark:text-red-400">Message not sent. Use a PDF, PNG, JPG, TXT or DOCX under 5 MB.</p>}</section>)
}
