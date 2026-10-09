import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
interface Conv { subject: string; status: string; messages: { id: string; sender_type: 'client' | 'admin'; message: string; created_at: string; attachment_url: string | null }[] }
export default function ClientConversation() {
  const { token = '' } = useParams(), qc = useQueryClient(), [text, setText] = useState(''), [file, setFile] = useState<File | null>(null)
  const q = useQuery({ queryKey: ['client-conv', token], queryFn: () => api<Conv>('client_get', { token }), refetchInterval: 15000, retry: false })
  const send = useMutation({
    mutationFn: async () => {
      let attachment_path: string | undefined
      if (file) {
        const u = await api<{ path: string; token: string }>('upload_url', { token, filename: file.name, size: file.size, type: file.type })
        const up = await supabase.storage.from('attachments').uploadToSignedUrl(u.path, u.token, file)
        if (up.error) throw new Error('File upload failed. Use a PDF, PNG, JPG, TXT, or DOCX file under 5 MB.')
        attachment_path = u.path
      }
      await api('client_send', { token, message: text.trim(), attachment_path })
    },
    onSuccess: () => { setText(''); setFile(null); qc.invalidateQueries({ queryKey: ['client-conv', token] }) },
  })
  if (q.isPending) return <p role="status" className="p-10">Loading…</p>
  if (q.isError) return <p role="alert" className="p-10 text-red-600 dark:text-red-400">{q.error instanceof Error ? q.error.message : 'Could not load this conversation.'}</p>
  return (<div className="mx-auto max-w-2xl px-4 py-14"><title>Your conversation — Geotech</title><h1 className="text-3xl font-bold">{q.data.subject}</h1>
    <p className="mt-1 text-sm text-muted">This page is private to you. Bookmark it to come back.</p>
    <ul className="mt-6 space-y-3">{q.data.messages.map(m => <li key={m.id} className={`rounded p-3 ${m.sender_type === 'admin' ? 'bg-band' : 'border border-line bg-surface'}`}>
      <span className="text-xs text-muted">{m.sender_type === 'admin' ? 'Geotech' : 'You'} · {new Date(m.created_at).toLocaleString()}</span><p className="whitespace-pre-wrap">{m.message}</p>
      {m.attachment_url && <a className="text-sm underline" href={m.attachment_url} target="_blank" rel="noreferrer">Open attachment</a>}</li>)}</ul>
    {q.data.status === 'open' ? <form className="mt-6 grid gap-3" onSubmit={e => { e.preventDefault(); if (text.trim()) send.mutate() }}>
      <label className="font-semibold">Reply<textarea className="mt-1 w-full rounded border border-line bg-surface px-3 py-2" rows={3} value={text} onChange={e => setText(e.target.value)}/></label>
      <label className="font-semibold">Attach a file (optional)<input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" className="mt-1 block" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
      {send.isError && <p role="alert" className="text-red-600 dark:text-red-400">{send.error instanceof Error ? send.error.message : 'Could not send reply.'}</p>}
      <button disabled={send.isPending} className="cursor-pointer justify-self-start rounded bg-accent px-6 py-2 font-semibold text-white dark:text-[#12131c]">{send.isPending ? 'Sending…' : 'Send reply'}</button></form>
      : <p className="mt-6 text-muted">This conversation is closed. Start a new project inquiry to continue.</p>}</div>)
}
