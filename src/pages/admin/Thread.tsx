import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService, attachmentError, type Inquiry } from '../../services/adminService'
import { supabase } from '../../lib/supabase'

function AttachmentLink({ path }: { path: string }) {
  const q = useQuery({ queryKey: ['att', path], staleTime: 4 * 60_000, queryFn: async () => {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 300)
    if (error) throw new Error('Attachment could not be opened.')
    return data.signedUrl
  } })
  return q.data
    ? <a className="text-sm underline" href={q.data} target="_blank" rel="noreferrer">Open attachment</a>
    : <span className="text-sm text-muted">{q.isError ? (q.error instanceof Error ? q.error.message : 'Attachment unavailable.') : 'Attachment…'}</span>
}

export default function Thread({ i }: { i: Inquiry }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const conv = useQuery({
    queryKey: ['conv', i.id],
    queryFn: () => adminService.conversation(i.id, `Project: ${i.name}`),
  })
  const cid = conv.data?.id
  const status = conv.data?.status ?? 'open'

  const msgs = useQuery({
    queryKey: ['msgs', cid],
    queryFn: () => adminService.messages(cid!),
    enabled: !!cid,
    refetchInterval: 15000,
  })

  // Mark incoming client messages as read when an authorized admin actually views this conversation.
  useEffect(() => {
    if (!cid || !msgs.data) return
    const hasUnreadClient = msgs.data.some((m) => m.sender_type === 'client' && !m.read_at)
    if (!hasUnreadClient) return
    void adminService.markConversationRead(cid)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['msgs', cid] })
        qc.invalidateQueries({ queryKey: ['admin-conversations'] })
      })
      .catch(() => { /* keep UI usable; unread state remains accurate */ })
  }, [cid, msgs.data, qc])

  const send = useMutation({
    mutationFn: () => adminService.send(cid!, text.trim(), file),
    onSuccess: () => {
      setText(''); setFile(null)
      qc.invalidateQueries({ queryKey: ['msgs', cid] })
      qc.invalidateQueries({ queryKey: ['admin-conversations'] })
    },
  })

  const setStatus = useMutation({
    mutationFn: (next: 'open' | 'closed') => adminService.setConversationStatus(cid!, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conv', i.id] })
      qc.invalidateQueries({ queryKey: ['admin-conversations'] })
    },
  })

  return (
    <section aria-label="Conversation" className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-bold">Conversation</h3>
        {conv.data && (
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${status === 'open' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
            {status === 'open' ? 'Open' : 'Closed'}
          </span>
        )}
        {conv.data && (
          <button
            type="button"
            className="cursor-pointer rounded border border-line bg-surface px-3 py-1 text-sm font-semibold disabled:opacity-50"
            disabled={setStatus.isPending || !cid}
            onClick={() => setStatus.mutate(status === 'open' ? 'closed' : 'open')}
          >
            {setStatus.isPending ? 'Updating…' : status === 'open' ? 'Close conversation' : 'Reopen conversation'}
          </button>
        )}
      </div>

      {conv.data && (
        <label className="mt-2 block text-sm text-muted">Client link (send this to the client)
          <input readOnly className="mt-1 w-full rounded border border-line bg-surface px-2 py-1 text-ink" value={`${location.origin}/c/${conv.data.access_token}`} onFocus={(e) => e.target.select()} />
        </label>
      )}

      {conv.isError && <p role="alert" className="mt-2 text-red-600">{conv.error instanceof Error ? conv.error.message : 'Conversation could not be loaded. Refresh and try again.'}</p>}
      {setStatus.isError && <p role="alert" className="mt-2 text-red-600">Could not update conversation status. Please try again.</p>}
      {msgs.isError && <p role="alert" className="mt-2 text-red-600">{msgs.error instanceof Error ? msgs.error.message : 'Messages could not be loaded. Refresh and try again.'}</p>}

      <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
        {msgs.isPending && <li role="status" className="text-muted">Loading messages…</li>}
        {msgs.data?.length === 0 && <li className="text-muted">No messages yet.</li>}
        {msgs.data?.map((m) => (
          <li key={m.id} className={`rounded p-2 ${m.sender_type === 'admin' ? 'bg-band' : 'border border-line'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{m.sender_type} · {new Date(m.created_at).toLocaleString()}</span>
              {m.sender_type === 'client' && !m.read_at && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Unread</span>}
            </div>
            <p className="whitespace-pre-wrap">{m.message}</p>
            {m.attachment_path && <AttachmentLink path={m.attachment_path} />}
          </li>
        ))}
      </ul>

      {status === 'closed' && <p className="mt-2 text-sm text-muted">This conversation is closed. Reopen it to allow client replies and admin replies.</p>}

      <form className="mt-3 grid gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim() && status === 'open') send.mutate() }}>
        <input aria-label="Message" className="rounded border border-line bg-surface px-2 py-1" value={text} onChange={(e) => setText(e.target.value)} disabled={status !== 'open'} />
        <input aria-label="Attach a file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={status !== 'open'} />
        <button disabled={send.isPending || !cid || status !== 'open'} className="cursor-pointer justify-self-start rounded bg-accent px-4 py-1 font-semibold text-white disabled:opacity-50 dark:text-[#12131c]">
          {send.isPending ? 'Sending…' : 'Send'}
        </button>
      </form>
      {send.isError && <p role="alert" className="mt-2 text-red-600 dark:text-red-400">{send.error instanceof Error ? send.error.message : attachmentError}</p>}
    </section>
  )
}
