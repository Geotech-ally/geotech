import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
export default function Async<T>({ q, empty, children }: { q: UseQueryResult<T>; empty: string; children: (d: T) => ReactNode }) {
  if (q.isPending) return <p role="status" className="py-10 text-muted">Loading…</p>
  if (q.isError) return <p role="alert" className="py-10">Couldn't load this content. Check your connection and refresh.</p>
  if (Array.isArray(q.data) && q.data.length === 0) return <p className="py-10 text-muted">{empty}</p>
  return <>{children(q.data)}</>
}
