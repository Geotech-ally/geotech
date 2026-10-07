import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { blogService } from '../services/contentService'
import Async from '../components/Async'
export function InsightsList() {
  const q = useQuery({ queryKey: ['posts'], queryFn: blogService.list })
  return (<div className="mx-auto max-w-3xl px-4 py-14"><title>Insights — Geotech</title><h1 className="text-4xl font-bold">Insights</h1>
    <Async q={q} empty="No articles yet.">{d => <ul className="mt-6 space-y-6">{d.map(p => <li key={p.id}><h2 className="text-2xl font-bold"><Link className="hover:underline" to={`/insights/${p.slug}`}>{p.title}</Link></h2>
      <p className="text-sm text-muted">{p.published_at && new Date(p.published_at).toLocaleDateString()}</p><p className="mt-1">{p.excerpt}</p></li>)}</ul>}</Async></div>)
}
export function InsightPost() {
  const { slug = '' } = useParams(), q = useQuery({ queryKey: ['post', slug], queryFn: () => blogService.get(slug) })
  if (q.isPending) return <p role="status" className="p-10">Loading…</p>
  if (q.isError) return <p role="alert" className="p-10">Couldn't load this article.</p>
  const p = q.data
  if (!p) return <p className="p-10">Article not found. <Link className="underline" to="/insights">All insights</Link></p>
  return (<article className="mx-auto max-w-2xl px-4 py-14"><title>{`${p.title} — Geotech`}</title><meta name="description" content={p.excerpt ?? ''}/>
    <h1 className="text-4xl font-bold">{p.title}</h1>{p.body.split(/\n{2,}/).map((t, i) => <p key={i} className="mt-4 text-lg leading-relaxed">{t}</p>)}</article>)
}
