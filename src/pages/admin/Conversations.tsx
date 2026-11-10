import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminService, type ConversationSummary } from '../../services/adminService'
import Thread from './Thread'

const f = 'rounded border border-line bg-surface px-2 py-1'

function StatusBadge({ status }: { status: 'open' | 'closed' }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${status === 'open' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
      {status === 'open' ? 'Open' : 'Closed'}
    </span>
  )
}

export default function Conversations() {
  const [status, setStatus] = useState<'' | 'open' | 'closed'>('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [sel, setSel] = useState<string>('')

  const q = useQuery({
    queryKey: ['admin-conversations', { status, unreadOnly }],
    queryFn: () => adminService.conversationSummaries({ status: status || undefined, unreadOnly }),
    refetchInterval: 15000,
  })

  const rows = q.data ?? []
  const cur = rows.find((r) => r.conversation_id === sel) ?? rows[0] ?? null

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_2fr]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Conversations</h1>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <select aria-label="Filter by conversation status" className={f} value={status} onChange={(e) => { setStatus(e.target.value as any); setSel('') }}>
            <option value="">All conversations</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setSel('') }} />
            Unread only
          </label>
        </div>

        {q.isPending && <p role="status" className="mt-4 text-muted">Loading conversations…</p>}
        {q.isError && (
          <div role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <p>{q.error instanceof Error ? q.error.message : 'Could not load conversations.'}</p>
            <button className="mt-2 cursor-pointer underline" onClick={() => q.refetch()}>Try again</button>
          </div>
        )}
        {!q.isPending && !q.isError && rows.length === 0 && <p className="mt-4 text-muted">No conversations found.</p>}

        <ul className="mt-3 divide-y divide-line rounded border border-line bg-surface">
          {rows.map((c) => (
            <li key={c.conversation_id}>
              <button
                onClick={() => setSel(c.conversation_id)}
                aria-current={c.conversation_id === (cur?.conversation_id ?? '')}
                className={`w-full cursor-pointer p-3 text-left ${c.conversation_id === (cur?.conversation_id ?? '') ? 'bg-band' : ''}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.client_name || c.client_email}</span>
                  <StatusBadge status={c.status} />
                  {Number(c.unread_count) > 0 && (
                    <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-white" aria-label={`${c.unread_count} unread messages`}>
                      {c.unread_count} unread
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted truncate">{c.latest_message_preview || c.subject}</p>
                <p className="mt-1 text-xs text-muted">
                  Latest: {new Date(c.latest_message_at).toLocaleString()} · {c.client_email}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        {cur ? (
          <article className="rounded border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold">{cur.client_name}</h2>
              <StatusBadge status={cur.status} />
              {Number(cur.unread_count) > 0 && <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-white">{cur.unread_count} unread</span>}
            </div>
            <p className="mt-1 text-sm text-muted">{cur.client_email} · Inquiry {cur.inquiry_status} · Latest {new Date(cur.latest_message_at).toLocaleString()}</p>
            <p className="mt-1 text-sm text-muted">Subject: {cur.subject}</p>
            <Thread i={{ id: cur.inquiry_id, name: cur.client_name, email: cur.client_email, phone: null, whatsapp: null, company_name: null, service_id: null, project_description: '', budget_range: null, timeline: null, referral_source: null, status: cur.inquiry_status, priority: 'normal', admin_notes: null, created_at: cur.created_at }} />
          </article>
        ) : (
          !q.isPending && <p className="text-muted">Select a conversation to view it.</p>
        )}
      </div>
    </div>
  )
}

