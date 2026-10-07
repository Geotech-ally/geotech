import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { servicesService } from '../services/servicesService'
import { formatPrice } from '../lib/money'
export default function ServiceDetail() {
  const { slug = '' } = useParams()
  const q = useQuery({ queryKey: ['service', slug], queryFn: () => servicesService.getBySlug(slug) })
  if (q.isPending) return <p role="status" className="p-10">Loading…</p>
  if (q.isError) return <p role="alert" className="p-10">Couldn't load this service.</p>
  const s = q.data
  if (!s) return <p className="p-10">This service isn't available. <Link className="underline" to="/services">Browse all services</Link></p>
  return (<article className="mx-auto max-w-3xl px-4 py-14"><title>{`${s.name} — Geotech`}</title><meta name="description" content={s.short_description}/>
    <h1 className="text-4xl font-bold">{s.name}</h1>
    <p className="mt-3 text-xl font-semibold text-accent">{formatPrice(s)}{s.estimated_duration && <span className="text-muted"> · {s.estimated_duration}</span>}</p>
    <p className="mt-6 text-lg">{s.description}</p>
    <h2 className="mt-8 text-2xl font-bold">What's included</h2>
    <ul className="mt-3 list-disc space-y-1 pl-5">{s.features.map(f => <li key={f}>{f}</li>)}</ul>
    <Link to={`/start?service=${s.slug}`} className="mt-8 inline-block rounded bg-accent px-6 py-3 font-semibold text-white dark:text-[#12131c]">Request a quote for {s.name}</Link></article>)
}
