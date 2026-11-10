import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Thread from './Thread'
import { adminService, PRIORITIES, STATUSES, type Inquiry, type InquiriesQuery } from '../../services/adminService'

const f = 'rounded border border-line bg-surface px-2 py-1'
const PAGE_SIZE = 20

export default function Inquiries() {
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState<string>('')

  // Debounce search to avoid a server query per keystroke while still using server-side filtering.
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      setSearch(searchInput.trim())
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const query: InquiriesQuery = useMemo(() => ({
    page,
    pageSize: PAGE_SIZE,
    status: status || undefined,
    search: search || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  }), [page, status, search, fromDate, toDate])

  const q = useQuery({
    queryKey: ['inquiries', query],
    queryFn: () => adminService.inquiries(query),
    placeholderData: keepPreviousData,
  })

  const upd = useMutation({
    mutationFn: (v: { id: string; patch: Partial<Inquiry> }) => adminService.updateInquiry(v.id, v.patch),
    onSuccess: async (_data, vars) => {
      // Keep current page results consistent without refetching the whole DB into the browser.
      qc.setQueriesData<{ rows: Inquiry[] } & Record<string, unknown>>({ queryKey: ['inquiries'] }, (old) => {
        if (!old?.rows) return old
        return { ...old, rows: old.rows.map((r) => r.id === vars.id ? { ...r, ...vars.patch } : r) }
      })
      await qc.invalidateQueries({ queryKey: ['inquiries'] })
    },
  })

  const rows = q.data?.rows ?? []
  const cur = rows.find((i) => i.id === sel) ?? null
  const total = q.data?.count ?? 0
  const totalPages = q.data?.totalPages ?? 1

  // Keep selection valid when page/filter changes; preserve selection if still present.
  useEffect(() => {
    if (rows.length === 0) { if (sel) setSel(''); return }
    if (!rows.some((r) => r.id === sel)) setSel(rows[0].id)
  }, [rows, sel])

  const setFilter = <T,>(setter: (v: T) => void, value: T) => {
    setter(value)
    setPage(1)
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_3fr]">
      <div>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Search inquiries"
            placeholder="Search name, email, company, description"
            className={`${f} flex-1 min-w-[14rem]`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select aria-label="Filter by status" className={f} value={status} onChange={(e) => setFilter(setStatus, e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="text-sm text-muted flex items-center gap-1">From
            <input aria-label="From date" type="date" className={f} value={fromDate} onChange={(e) => setFilter(setFromDate, e.target.value)} />
          </label>
          <label className="text-sm text-muted flex items-center gap-1">To
            <input aria-label="To date" type="date" className={f} value={toDate} onChange={(e) => setFilter(setToDate, e.target.value)} />
          </label>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted">
          <span>
            {q.isPending ? 'Loading inquiries…' : `${total} record${total === 1 ? '' : 's'}`}
          </span>
          <span>Page {q.data?.page ?? page} of {totalPages}</span>
        </div>

        {q.isError && (
          <div role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <p>{q.error instanceof Error ? q.error.message : 'Could not load inquiries.'}</p>
            <button className="mt-2 cursor-pointer underline" onClick={() => q.refetch()}>Try again</button>
          </div>
        )}

        {!q.isError && !q.isPending && rows.length === 0 && (
          <p className="mt-4 text-muted">No inquiries found. Try clearing filters or check back later.</p>
        )}

        {q.isFetching && !q.isPending && <p role="status" className="mt-2 text-sm text-muted">Refreshing…</p>}

        <ul className="mt-3 divide-y divide-line rounded border border-line bg-surface">
          {rows.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => setSel(i.id)}
                aria-current={i.id === sel}
                className={`w-full cursor-pointer p-3 text-left ${i.id === sel ? 'bg-band' : ''}`}
              >
                <span className="font-semibold">{i.name}</span>{' '}
                <span className="text-sm text-muted">{i.status} · {i.priority}</span><br />
                <span className="text-sm text-muted">{new Date(i.created_at).toLocaleDateString()} · {i.email}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center gap-2">
          <button
            className={`${f} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={(q.data?.page ?? page) <= 1 || q.isFetching}
          >
            Previous
          </button>
          <button
            className={`${f} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={() => setPage((p) => p + 1)}
            disabled={(q.data?.page ?? page) >= totalPages || q.isFetching}
          >
            Next
          </button>
          <span className="text-sm text-muted">Server-side pagination · {PAGE_SIZE} per page</span>
        </div>
      </div>

      <div>
        {cur ? (
          <article className="rounded border border-line bg-surface p-5">
            <h2 className="text-2xl font-bold">{cur.name}</h2>
            <p className="text-muted">{cur.company_name || '—'} · {cur.email}{cur.phone && ` · ${cur.phone}`}</p>
            <p className="mt-3 whitespace-pre-wrap">{cur.project_description}</p>
            <p className="mt-2 text-sm text-muted">Budget: {cur.budget_range ?? '—'} · Timeline: {cur.timeline ?? '—'}</p>
            <p className="mt-1 text-sm text-muted">Received: {new Date(cur.created_at).toLocaleString()}</p>

            <div className="mt-4 flex flex-wrap gap-3">
              <label>Status{' '}
                <select className={f} value={cur.status} onChange={(e) => upd.mutate({ id: cur.id, patch: { status: e.target.value } })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>Priority{' '}
                <select className={f} value={cur.priority} onChange={(e) => upd.mutate({ id: cur.id, patch: { priority: e.target.value } })}>
                  {PRIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
            {upd.isError && <p role="alert" className="mt-2 text-sm text-red-600">Update failed. Please try again.</p>}

            <label className="mt-4 block">Private notes
              <textarea
                key={cur.id}
                className={`${f} mt-1 w-full`}
                rows={3}
                defaultValue={cur.admin_notes ?? ''}
                onBlur={(e) => e.target.value !== (cur.admin_notes ?? '') && upd.mutate({ id: cur.id, patch: { admin_notes: e.target.value } })}
              />
            </label>

            <Thread i={cur} />
          </article>
        ) : (
          <p className="text-muted">{q.isPending ? 'Loading inquiry details…' : 'Select an inquiry to review it.'}</p>
        )}
      </div>
    </div>
  )
}
